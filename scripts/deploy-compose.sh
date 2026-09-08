#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# Finish building before interrupting the running release.
docker compose build app pre-generator
docker compose up -d --wait db redis

# Neither old writer may use the database while its schema changes.
docker compose stop app pre-generator
docker compose run --rm --no-deps app pnpm db:migrate

# Both writers now use the new images and the migrated schema. If migration
# fails, set -e leaves them stopped instead of running incompatible code.
docker compose up -d --no-build --force-recreate --remove-orphans app pre-generator
