# Agent instructions

## Database migrations

Production deploys apply migrations while the previous release is still serving.
The new release then starts beside it and the proxy switches over. The previous
app and scheduler run on the new schema until the switch, and stay on it if the
new release fails to start. `scripts/deploy-compose.sh` does not stop them first.

Every migration must work with the code of the release before it.

A migration can ship in the same PR as the code that needs it when the previous
release cannot notice it:

- a new table, with its own indexes and constraints
- a new index that is not unique
- a new column that is nullable or has a default
- dropping `NOT NULL` or setting a default
- an `UPDATE` or `INSERT` that backfills rows

Anything else breaks queries the previous release still sends and needs more
than one PR. That covers dropping or renaming a column or table, changing a
column's type, and adding `NOT NULL`, a unique index, a check or a foreign key
to an existing column.

### Removing a column or table takes two PRs

1. The first PR removes every read and write of the field and removes it from
   the Drizzle schema in `src/db/schema.ts` or `src/db/auth-schema.ts`. It does
   not run `pnpm db:generate` for the removal. Drizzle names every schema column
   in `SELECT`, `INSERT` and `RETURNING`, so code whose schema still lists the
   column fails once the column is gone, even if nothing reads it. If the column
   is `NOT NULL` without a default, this PR also adds a hand-written migration
   with `pnpm db:generate --custom` that drops the `NOT NULL`, because inserts
   no longer supply a value.
2. The second PR runs `pnpm db:generate` and contains only the resulting `DROP`
   migration. Open it only after the first PR's deploy job has finished on
   `main`. CI keeps one pending deploy and cancels older pending ones, so two
   quick merges can ship as one release and skip the step that makes the drop
   safe.

Treat a rename or a type change as an addition followed by a removal. Add the
new column, write both, backfill, and read the new one. Then remove the old
column with the two PRs above.

### CI enforces this

The `migrations` job runs `scripts/check-migrations.ts` and gates the deploy.
It reads every migration the change adds and fails on any statement outside the
safe list above. It allows a drop only when `src/db` is unchanged since the
previous release, which is what the second PR looks like. On `main` the
previous release is the one production serves, so a drop also fails when the
first PR never deployed. Re-run the first PR's deploy job, then the failed
check. Run `pnpm db:check-migrations` locally to compare with `origin/main`.

Some flagged statements are fine because of what the previous release does,
such as `SET NOT NULL` on a column every insert already sets. Put
`-- safe-with-previous-release: <why>` on a line above the statement, inside
the same `--> statement-breakpoint` block. Do not use it to skip the two PRs.

If a PR needs a migration that cannot follow these rules, stop and say so
instead of merging it. `sh scripts/deploy-compose.sh --update-dependencies` on
the server is the only path that stops both writers before migrating.
