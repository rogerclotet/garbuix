#!/bin/sh
set -e

# Use Madrid timezone for date computation (matches the app's puzzle date keys)
MADRID_TZ="Europe/Madrid"
TODAY=$(node -e "
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: '$MADRID_TZ', year: 'numeric', month: '2-digit', day: '2-digit' });
  process.stdout.write(f.format(new Date()));
")
TOMORROW=$(node -e "
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: '$MADRID_TZ', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  process.stdout.write(f.format(d));
")

echo "[pre-generator] Ensuring puzzles for $TODAY and $TOMORROW"
pnpm backfill:puzzles --from "$TODAY" --to "$TOMORROW"
