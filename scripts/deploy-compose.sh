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
  docker compose build app pre-generator
fi

if [ "${1:-}" = "--update-dependencies" ]; then
  # Dependency maintenance must not interrupt connections from live writers.
  docker compose stop pre-generator
  docker compose stop app
  docker compose up -d --pull always --wait --wait-timeout 120 db redis
else
  # Routine releases must not reconcile dependency image/configuration drift.
  docker compose up -d --no-recreate --wait --wait-timeout 120 db redis
fi

# Neither old writer may use the database while its schema changes.
if [ "${1:-}" != "--update-dependencies" ]; then
  # Let scheduler shutdown finish while the frontend is still serving.
  docker compose stop pre-generator
  docker compose stop app
fi
docker compose run --rm --no-deps app pnpm db:migrate

# Both writers now use the new images and the migrated schema. If migration
# fails, set -e leaves them stopped instead of running incompatible code.
# Compose starts no service until every listed one is recreated, so recreate
# the app alone to keep the scheduler's container swap out of the outage.
docker compose up -d --no-build --no-deps --force-recreate --remove-orphans \
  --wait --wait-timeout 120 app
docker compose up -d --no-build --no-deps --force-recreate \
  --wait --wait-timeout 120 pre-generator
