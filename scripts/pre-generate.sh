#!/bin/sh
set -e

TODAY=$(node -e "process.stdout.write(new Date().toISOString().slice(0,10))")
TOMORROW=$(node -e "const d=new Date(); d.setUTCDate(d.getUTCDate()+1); process.stdout.write(d.toISOString().slice(0,10))")

echo "[pre-generator] Ensuring puzzles for $TODAY and $TOMORROW"
pnpm backfill:puzzles --from "$TODAY" --to "$TOMORROW"
