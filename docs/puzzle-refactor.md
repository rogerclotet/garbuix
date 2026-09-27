# Puzzle refactor

## Findings and scope

Classic and Mini already shared their progress types, guess resolver, reducer foundations, encrypted answer decoding, grid, controls, confetti and rollover handling. The maintenance problem was ownership: reusable code lived under `components/daily`, and the classic screen interleaved several independent features.

The production files with the clearest refactor opportunities were:

| File | Original lines | Decision |
| --- | ---: | --- |
| `components/daily/daily.tsx` | 1,627 | Separate gameplay actions, animations, clues, onboarding, completion, sharing and status rendering. |
| `lib/crossword-generator.ts` | 1,436 | Separate reusable grid placement, word metadata and seeded randomness from daily selection policy. |
| `components/daily/use-daily-progress.ts` | 778 | Keep its request and hydration lifecycle together in this change. A later extraction needs to preserve logout, reset, stale-response and outbox ordering guarantees. |
| `routes/preferencies.tsx` | 608 | A later change can separate preference sections. It contributes little to classic/Mini duplication. |
| `lib/use-clue-requests.tsx` | 598 | Keep its connection and replay lifecycle together; the classic screen now consumes it through its clue hook. |
| `components/daily/daily-controls.tsx` | 513 | Move to shared ownership as `components/puzzle/puzzle-controls.tsx`. Further separation by keypad arrangement can be reviewed independently. |

Large test files, generated files and UI library wrappers were lower priority than production modules with mixed responsibilities.

## Implemented plan

1. Move reusable visual components and decoding/rollover hooks to `components/puzzle`. Update classic, Mini, tutorial, route and test consumers directly.
2. Move game-neutral helpers to `lib/puzzle-helpers.ts`. Mini's reducer and server no longer import a component module.
3. Consolidate the global keyboard listener in `usePuzzleKeyboard`. Keep each mode's minimum word length and Mini's busy guard explicit. Preserve native input inside editors, dialogs and focused controls. The tutorial retains its local listener.
4. Split classic orchestration into feature hooks, keeping each feature's refs, timers, effects and cleanup in one owner. Keep `DailySession` mounted across account changes and remount `DailyGame` by player as before.
5. Split generation without changing random-call order, metadata cache ownership, selection policy or public exports. Mini imports the shared placement engine directly.
6. Run the component and persistence suites, compare complete generated puzzles before and after, and verify the production build.

## Where code lives now

| Responsibility | Owner |
| --- | --- |
| Classic session and page composition | `components/daily/daily.tsx`, reduced to 434 lines |
| Classic guesses, bonus letters, haptics and pointer activation | `components/daily/use-daily-actions.ts` |
| Submit feedback, flying letters and word-location effects | `components/daily/use-daily-animations.ts` |
| AI clues, fallback letters, peer help and clue highlighting | `components/daily/use-daily-clues.ts` |
| First-visit dialogs and sign-in entry points | `components/daily/use-daily-onboarding.ts` |
| Streaks, completion analytics, delayed celebration and win dialog | `components/daily/use-daily-completion.ts` |
| Share preview and header callback registration | `components/daily/use-daily-share.ts` |
| Classic meters and completion summary | `components/daily/daily-status.tsx` |
| Shared rendering, input and decoded snapshots | `components/puzzle` |
| Shared cell, word, keyboard and history helpers | `lib/puzzle-helpers.ts` |
| Daily selection, freshness scoring and generation history | `lib/crossword-generator.ts`, reduced to 719 lines |
| Shared crossword placement, metadata and randomness | `lib/crossword` |

Each mode still restores its own progress before handing it to shared decoding. Decoding publishes letters and counters together. The screen then combines shared rendering with mode-specific actions and help.

## Contracts preserved

Classic persists an acknowledged event outbox and supports resets. Mini uploads snapshots and merges them monotonically. Combining their transport hooks would obscure those differences. Their storage keys, server contracts, identity boundaries and hint policies remain unchanged.

Classic retains three AI hints, deterministic fallback letters, peer help and optional bonus letters. Mini retains unlimited letter hints, its shorter word-length limit and its own completion behavior.

The deliberate input change is consistent keyboard ownership: both boards now ignore already handled keys, editable descendants, open dialogs/menus, held submit keys and Enter/Space intended for a focused button or link.

## Verification

- Full suite passed with a temporary PostgreSQL database, including account persistence, anonymous imports, outbox races and Mini snapshot merging.
- Shared keyboard tests cover both length limits, accents, modifiers, editable descendants, overlays, native control activation, busy/disabled states and listener cleanup.
- Completion tests cover restored games, normal/reduced-motion delay and cleanup during both pending celebration stages.
- Complete generator output matched byte for byte for classic seeds `260401`, `260405`, `260411`, `260927` and the corresponding Mini dates. The comparison includes word order, grid cells, placement coordinates, letters and shuffled letters.
- Type checking, Biome lint/check and the production build passed.
- Browser smoke checks passed for tutorial keyboard entry, classic guessing, Mini guessing and letter hints. Enter on a focused Mini hint button revealed a letter while preserving the typed guess. Both boards rendered correctly in the local production build.
