#!/bin/sh
set -eu

case "$*" in
  ""|--update-dependencies) ;;
  *) echo "Usage: $0 [--update-dependencies]" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

# Docker excludes .git, so resolve the release before sending the build context.
SENTRY_RELEASE="$(git rev-parse --short=8 HEAD)"
export SENTRY_RELEASE

# Finish building before interrupting the running release.
docker compose build app pre-generator

if [ "${1:-}" = "--update-dependencies" ]; then
  # Dependency maintenance must not interrupt connections from live writers.
  docker compose stop app pre-generator
  docker compose up -d --pull always --wait --wait-timeout 120 db redis
else
  # Routine releases must not reconcile dependency image/configuration drift.
  docker compose up -d --no-recreate --wait --wait-timeout 120 db redis
fi

# Neither old writer may use the database while its schema changes.
if [ "${1:-}" != "--update-dependencies" ]; then
  docker compose stop app pre-generator
fi
docker compose run --rm --no-deps app pnpm db:migrate

# Both writers now use the new images and the migrated schema. If migration
# fails, set -e leaves them stopped instead of running incompatible code.
docker compose up -d --no-build --no-deps --force-recreate --remove-orphans \
  --wait --wait-timeout 120 app pre-generator
