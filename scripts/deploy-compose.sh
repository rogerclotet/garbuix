#!/bin/sh
set -eu

case "$*" in
  ""|--update-dependencies) ;;
  *) echo "Usage: $0 [--update-dependencies]" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

# Must match the image names in compose.yml.
APP_IMAGE=paraules-app:prod
SCHEDULER_IMAGE=paraules-scheduler:prod
# Must match the import in proxy/Caddyfile.
UPSTREAM_FILE=/state/upstream.caddy

route_to() {
  docker compose exec -T proxy sh -c "echo 'to app-$1:3000' > $UPSTREAM_FILE"
  # Caddy swaps its configuration without closing the listener; requests
  # already with the old color finish there.
  docker compose exec -T proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}

# Get the new images before interrupting the running release.
if [ -n "${DEPLOY_APP_IMAGE:-}${DEPLOY_SCHEDULER_IMAGE:-}" ]; then
  : "${DEPLOY_APP_IMAGE:?DEPLOY_APP_IMAGE and DEPLOY_SCHEDULER_IMAGE must be set together}"
  : "${DEPLOY_SCHEDULER_IMAGE:?DEPLOY_APP_IMAGE and DEPLOY_SCHEDULER_IMAGE must be set together}"
  # CI builds and pushes both images, so the server never competes with the
  # live app for CPU and memory while building.
  docker pull "$DEPLOY_APP_IMAGE"
  docker pull "$DEPLOY_SCHEDULER_IMAGE"
  # Compose and manual commands keep using the stable local names.
  docker tag "$DEPLOY_APP_IMAGE" "$APP_IMAGE"
  docker tag "$DEPLOY_SCHEDULER_IMAGE" "$SCHEDULER_IMAGE"
  # Untag the registry names so superseded releases become prunable.
  docker image rm "$DEPLOY_APP_IMAGE" "$DEPLOY_SCHEDULER_IMAGE"
else
  # Docker excludes .git, so resolve the release before sending the build context.
  SENTRY_RELEASE="$(git rev-parse --short=8 HEAD)"
  export SENTRY_RELEASE
  # Both colors run the same image.
  docker compose build app-blue pre-generator
fi

if [ "${1:-}" = "--update-dependencies" ]; then
  # Dependency maintenance must not interrupt connections from live writers.
  docker compose stop pre-generator
  docker compose stop app-blue app-green
  docker compose up -d --pull always --remove-orphans --wait --wait-timeout 120 db redis proxy
else
  # Routine releases must not reconcile dependency image/configuration drift.
  # The app container from before the proxy existed is an orphan holding the
  # proxy's host port.
  docker compose up -d --no-recreate --remove-orphans --wait --wait-timeout 120 db redis proxy
fi

upstream="$(docker compose exec -T proxy sh -c "cat $UPSTREAM_FILE 2>/dev/null || true")"
case "$upstream" in
  *app-blue*) active=blue next=green ;;
  *app-green*) active=green next=blue ;;
  "") active="" next=blue ;;
  *) echo "Unrecognized proxy upstream: $upstream" >&2; exit 1 ;;
esac

serving=""
if [ -n "$active" ] && [ -n "$(docker compose ps -q --status running "app-$active")" ]; then
  serving=$active
else
  # Nothing is serving, so the proxy holds requests for the new release
  # instead of failing them against a stopped app.
  route_to "$next"
fi

# The old app and scheduler keep running on the migrated schema until the new
# release takes over, and stay on it if the new release never becomes ready.
# AGENTS.md requires every migration to work with the release before it.
docker compose run --rm --no-deps "app-$next" pnpm db:migrate

# Compose starts no service until every listed one is recreated, so recreate
# the app alone to keep the scheduler's container swap out of the switchover.
docker compose up -d --no-build --no-deps --force-recreate \
  --wait --wait-timeout 120 "app-$next"
if [ -n "$serving" ]; then
  # The old release served until this point. If the migration failed or the
  # new release never became ready, set -e stopped above and it still serves.
  route_to "$next"
  docker compose stop "app-$serving"
fi
docker compose up -d --no-build --no-deps --force-recreate \
  --wait --wait-timeout 120 pre-generator
