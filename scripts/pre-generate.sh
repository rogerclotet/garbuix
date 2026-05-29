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

# Generate AI clues for the puzzle we just ensured. The puzzle backfill only
# fires clue generation as fire-and-forget, which gets killed when that one-shot
# process exits; this awaits it to completion. Idempotent: existing clues skip.
echo "[pre-generator] Ensuring AI clues for $TOMORROW"
pnpm clues:backfill --from "$TOMORROW" --to "$TOMORROW"
