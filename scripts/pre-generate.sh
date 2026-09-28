#!/bin/sh
set -e

# Use Madrid timezone for date computation (matches the app's puzzle date keys)
MADRID_TZ="Europe/Madrid"
TOMORROW=$(node -e "
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: '$MADRID_TZ', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  process.stdout.write(f.format(d));
")

echo "[pre-generator] Ensuring puzzle for $TOMORROW"
pnpm backfill:puzzles --from "$TOMORROW" --to "$TOMORROW"

# Puzzle backfill skips background clues because it closes its database pool on
# exit. Generate clues here and await all writes before closing this process's pool.
echo "[pre-generator] Ensuring AI clues for $TOMORROW"
pnpm clues:backfill --from "$TOMORROW" --to "$TOMORROW"
