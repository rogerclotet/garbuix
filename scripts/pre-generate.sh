#!/bin/sh
set -e

# Both startup and cron invocations use the app's Madrid pre-generation window.
TOMORROW=$(node --import tsx --input-type=module -e "
  import { addDaysToDateKey, getDateKeyForDate, isWithinPregenerationWindow } from './src/lib/puzzle-dates.ts';
  const now = new Date();
  if (isWithinPregenerationWindow(undefined, now)) {
    process.stdout.write(addDaysToDateKey(getDateKeyForDate(now), 1));
  }
")

if [ -z "$TOMORROW" ]; then
  echo "[pre-generator] Outside the 23:00-midnight Europe/Madrid window; skipping generation"
  exit 0
fi

echo "[pre-generator] Ensuring puzzle for $TOMORROW"
pnpm backfill:puzzles --from "$TOMORROW" --to "$TOMORROW"

# Puzzle backfill skips background clues because it closes its database pool on
# exit. Generate clues here and await all writes before closing this process's pool.
echo "[pre-generator] Ensuring AI clues for $TOMORROW"
pnpm clues:backfill --from "$TOMORROW" --to "$TOMORROW"
