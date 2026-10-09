# Garbuix

A responsive web application for a Catalan crossword-style word game.

## Features

- 🎮 Interactive crossword puzzle game with Catalan words
- 📚 Uses a general Catalan lexicon from [Softcatalà](https://github.com/Softcatala/catalan-dict-tools)
- 💡 AI clues grounded in [Viccionari](https://ca.wiktionary.org/) definitions
- 🎯 5-15 words per game, all crossing with each other
- 🔤 Guess words without accents, see them properly spelled
- 📱 Fully responsive design
- 🎨 Modern UI with Tailwind CSS and shadcn/ui components
- 🌓 Dark mode with system preference detection and manual toggle

## How to Play

### Garbuix síl·labes

`/sillabes` is a daily game for early readers, available alongside Garbuix and
Mini in the menu. Five connected words share whole syllables, with exactly six
different syllables on the keypad. Tap syllables in order and submit a word;
syllables can repeat within a word. Input ignores accents, while the crossword
shows the correct spelling. Hold Pista to reveal a whole syllable, with no limit.

Valid words outside the crossword are accepted as extras and shown in muted text
alongside the five target words after completion. Completion ends play for the day. There
is no leaderboard or audio. The orange theme supports light and dark mode.
Browser saves, account sync, guest imports, and `/sillabes/dies-anteriors` history
are separate from both other modes. Daily rollover uses Europe/Madrid.

The target vocabulary and manually entered divisions live in
`src/data/syllable-words.ts`.
They were written for this mode rather than imported from an external word list.
Dictionary generation checks every division against hyphen-ca and fails on any
mismatch. CI also compares every target with the independently generated
dictionary; the manual entries never override hyphen-ca's output.
Extra words use Softcatalà's dictionary, including words shorter than four letters.
The existing dictionary has no syllable field. `scripts/build-syllable-dictionary.ts`
applies the Catalan patterns from [Jaume Ortolà's hyphen-ca](https://github.com/jaumeortola/hyphen-ca),
the source linked by [Softcatalà's separator](https://www.softcatala.org/sillabes/).
The pattern revision is pinned in the script; downloaded JavaScript is parsed
as data, never executed. Patterns are GPL-3.0. Generated word divisions are
written to the gitignored `src/data/catalan-syllables.json` and bundled on the
server, so play requires no external syllabification service. Guess validation
checks the chosen syllable boundaries, not only the concatenated letters.

The pinned patterns are a build-time data dependency used only by Síl·labes;
Mini's extra-word dictionary uses the original word list without syllable divisions.
The five crossword targets use the validated curated divisions, while hyphen-ca
also supplies the extra-word dictionary. Daily Síl·labes boards are generated on
the first request for that date and stored with their accepted guesses; they are
not part of the regular game's nightly pre-generator. Rebuilding the dictionary
does not change existing stored boards.

hyphen-ca publishes data files rather than an npm package, so the commit in
`SOURCE` acts as the dependency lock. Its `ca.js` matches the v1.5 release.
To update it, change that revision, run `pnpm download-dict`, and check the
syllable tests before deploying.

`pnpm download-dict` rebuilds all dictionaries, including syllable divisions.
Run it after changing the curated vocabulary. Builds and `pnpm ensure-dict`
generate missing files automatically. Apply migration `0010_syllables.sql`
with `pnpm db:migrate` before running this mode.

### Garbuix mini

`/mini` is a separate daily game for early readers, also available in the menu.
Each board has five connected words drawn from the curated Catalan vocabulary in
`src/data/mini-words.ts`. All words have 3–5 letters. Hints reveal one hidden cell
after holding Pista for 600 ms, with no limit, descriptive clues, or leaderboard.

Mini accepts dictionary words of 3–5 letters formed from the day's letters,
including words outside the five-word crossword. Input is capped at five letters,
and submission stays disabled until there are at least three. Extras are saved
locally and synced to accounts, then appear in muted text in the combined list
after completion. The five targets still come from the curated Mini vocabulary.
Existing daily boards receive the extra-word dictionary when loaded.

Mini has a purple theme, separate browser saves and account progress, and its own
history at `/mini/dies-anteriors`, including yesterday's completed board. Guest
progress imports into Mini when signing in. Regular Garbuix results are untouched.
Daily puzzles follow the same Europe/Madrid rollover as the regular game.

Apply the database migrations with `pnpm db:migrate` before running this version.
Migration `0008` adds the `mini_puzzles` and `mini_progress` tables.

### Regular Garbuix

1. Look at the crossword grid (letters are hidden initially)
2. Type a word you think appears in the crossword
3. When you guess correctly, the word reveals on the grid
4. Complete the puzzle by finding all words!

## Setup

### Prerequisites

- Node.js 25.2.x (see `engines.node` in `package.json`)
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Download the Catalan dictionary (required before first run)
pnpm download-dict

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`

### Error tracking

The Sentry SDK sends browser errors, caught router errors, server request errors,
and server function errors to the configured Sentry-compatible service, such as
self-hosted GlitchTip. The client initializes before hydration. `pnpm dev` and
`pnpm start` preload the server SDK, and
`pnpm build` copies its configuration into the Nitro output. Events use the
development or production environment. Both SDKs share `sentry-privacy.ts`, which
removes request data, personal context and attachments.
Reports keep exception messages, error classes and code locations for diagnosis.
Do not include credentials or player data in exception messages. Breadcrumbs,
automatic session reports, logs and metrics are disabled; replay and tracing are
not enabled. This limits diagnostic detail and does not hide the network source IP.

Caught background generation, leaderboard, history, and progress failures are
reported explicitly. Progress retries report the first failure in an outage;
Redis connection errors report once until the connection recovers. React root
errors and recoverable hydration errors are also captured. Exception handled
status is retained for alert rules without retaining mechanism data.

Route bundle failures retry once silently using the reload guard shared with
TanStack Router. They are reported only if the same error reaches the boundary
with that guard already set. Initial failures while offline or with blocked
session storage keep the manual reload button without sending a report.
There are no attempt or recovery-success events, and other application errors
are still reported immediately.

Known Node/srvx incoming-request disconnects are filtered before privacy
scrubbing, using their error messages and transport stack frames. Other aborts,
timeouts, outgoing connection failures, and errors wrapping a disconnect are
still reported.

The scheduled `backfill:puzzles` and `clues:backfill` commands preload the same
server SDK and release as the web app. They report job and cleanup failures and
wait up to five seconds for pending reports before exiting, including errors
caught inside otherwise successful jobs. A job that never starts cannot report
an exception; monitor scheduler availability separately.

The Catalan privacy policy is available from the menu at `/privacitat`.

Set these values in `.env` or the deployment environment:

| Variable | Purpose |
| --- | --- |
| `VITE_SENTRY_DSN` | Browser project DSN, embedded at build time. Also determines the allowed reporting origin in the CSP for static assets and SSR responses. |
| `SENTRY_DSN` | Server and background-job project DSN, read at process startup. |
| `SENTRY_URL` | Source-map API base URL, for example `https://glitchtip.example.com/`. Defaults to `https://sentry.io/` if omitted. |
| `SENTRY_ORG` | Organization slug on that instance, for example `my-org`. |
| `SENTRY_PROJECT` | Project slug on that instance, for example `my-project`. This is not the numeric project ID in the DSN. |
| `SENTRY_AUTH_TOKEN` | API token issued by that instance, used only to upload source maps during builds. Never prefix this with `VITE_`. |

`.env.example` leaves reporting disabled and includes generic examples. Set both
DSN variables to your project DSN to report browser and server errors to the same
project. An empty or absent DSN disables reporting for that runtime. Local
`pnpm dev` loads `.env` before the server SDK starts. Rebuild after changing `VITE_SENTRY_DSN`; changing a running
container's environment cannot change the browser bundle or its CSP.

Source-map uploads are optional. Local builds read the upload settings from
`.env` or exported variables. Supplying a token requires both organization and
project slugs. Without a token, uploads and the plugin's map generation are disabled.
Use a GlitchTip API token when targeting GlitchTip; a Sentry token will not work.
Releases use `garbuix@<version>`, such as `garbuix@a1b2c3d4`, with the current
commit's short SHA as the version. The deployment
script passes it into Docker, and the build records the same release for
source-map uploads, browser errors, server errors, and the about page. Local builds read Git
directly. Builds without Git metadata can set `SENTRY_RELEASE` to the version
without the `garbuix@` prefix; otherwise they use `garbuix@dev`.
The release is saved with the build, so no runtime
release variable is needed.

For direct Docker builds, export the variables above, pass the public settings
as build arguments and the token as a BuildKit secret. Pass `SENTRY_DSN` to the
running container separately:

```bash
docker build --target production \
  --build-arg SENTRY_RELEASE="$(git rev-parse --short=8 HEAD)" \
  --build-arg VITE_SENTRY_DSN --build-arg SENTRY_URL \
  --build-arg SENTRY_ORG --build-arg SENTRY_PROJECT \
  --secret id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN -t paraules-app:prod .
```

For the standard Compose deployment, set the variables above in the deployment
server's `.env` file. Compose passes the browser DSN and upload settings as build
arguments, the token as a BuildKit secret, and the server DSN to the app, scheduler,
and backfill containers. A GitHub Actions secret alone is not forwarded to the remote
server by the deployment workflow.

The token is only available during the build and is not stored in the image or
added to the running containers' environment. Builds without a token still work,
but skip source-map uploads. The Sentry plugin deletes uploaded maps from the
build output.

Docker does not invalidate its build cache when secret values change. After
adding or rotating the token, rebuild once without cache before deploying:

```bash
SENTRY_RELEASE="$(git rev-parse --short=8 HEAD)" docker compose build --no-cache app pre-generator
sh scripts/deploy-compose.sh
```

Check the build logs for the upload plugin's successful upload message; a cached build does
not rerun the upload.

To verify delivery after a deployment, exercise an error from a real browser
interaction and one from a server request/function. Confirm both events in
the configured GlitchTip project, with the production environment, expected release and original
source locations. Exception messages are preserved, so search for the original
message and use the event ID, time and stack location to identify each report.
Message-only events from `captureMessage` are intentionally dropped.

Configure production alerts for new issues and resolved issues that recur, and
verify the intended recipient actually receives the test notification. Repeating
an unresolved issue does not trigger a new-issue alert. Check GlitchTip's event limits and
inbound filters if reports are missing; a successful build or local test does not
prove ingestion or notification delivery. Browser blockers and network failures
can prevent client delivery. Errors thrown directly in the browser console do
not exercise the normal application capture path.

## Docker Compose

Copy the example env first:

```bash
cp .env.example .env
```

### Development

This starts Postgres, installs dependencies in the container, runs migrations, and starts the Vite/TanStack Start dev server with your local source mounted into the container.

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

The app will be available at `http://localhost:3000` and Postgres at `localhost:5432`.

### Privacy

The app does not send analytics, error reports, session recordings, or performance
telemetry. Game progress, account sessions, leaderboards, and peer clues still use
the app server and its database. Google sign-in and avatars contact Google;
optional AI clue generation sends puzzle words to Anthropic. Fonts are bundled
locally.

### Production

Migration `0009` is required for Better Auth 1.7.6. It makes the legacy
`account.issuer` column nullable, preserves its values, and replaces its unique
index with one on `provider_id` and `account_id`. Check for duplicate identities
before deploying:

```sql
SELECT provider_id, account_id, count(*)
FROM account
GROUP BY provider_id, account_id
HAVING count(*) > 1;
```

Resolve any returned rows without merging distinct users. The migration fails
if duplicates remain. Use `sh scripts/deploy-compose.sh` to stop the old writers,
apply the migration, and start the updated app together. See the
[Better Auth upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key).

Build both production images, keep existing PostgreSQL and Redis containers,
stop the clue scheduler while the app still serves requests, then stop the app,
apply migrations, recreate both application services from the new images and wait
for app readiness. The app starts Node directly without repeating migrations or
launching pnpm. Stopping both writers before
migrating prevents old code from querying removed columns. The app is briefly
unavailable during migration and restart. If migration fails, both services stay
stopped so the failure can be resolved before restarting.

```bash
sh scripts/deploy-compose.sh
```

Routine deployments deliberately defer PostgreSQL and Redis image/configuration
changes. To apply those changes, use the explicit dependency maintenance mode:

```bash
sh scripts/deploy-compose.sh --update-dependencies
```

This builds the application images first, stops both writers, pulls the configured
dependency images, updates PostgreSQL and Redis, waits for their healthchecks,
then migrates and starts the application. Take a database backup before database
upgrades; changing PostgreSQL major versions requires a separate data migration.
If dependency maintenance or migration fails, both writers remain stopped.
Resolve the failure and rerun the maintenance command.

Dependency and application readiness waits each have a 120-second limit. A failed
app readiness check fails the deployment; inspect `docker compose ps` and
`docker compose logs app db redis` before retrying. It does not automatically roll
back schema changes or restart unhealthy containers.

`/api/health` remains a cheap liveness check. `/api/ready` returns 200 only when
PostgreSQL answers a query and configured Redis answers a ping, or 503 on failure
or a two-second timeout. Both endpoints support GET and HEAD and disable caching.
The app's Compose healthcheck uses `/api/ready`. Redis is optional when REDIS_URL
is unset; the production Compose configuration sets it by default.

For external uptime monitoring, use `/api/ready` to include dependency failures.
Configure two or three consecutive failures before alerting, or a bounded
maintenance window covering deployment, to tolerate the planned migration gap.
Monitor configuration lives outside this repository. Readiness checks verify
recovery; they do not eliminate downtime. Application Redis failures continue to
be reported to GlitchTip once per outage.

Use this script for production updates. Production containers do not run migrations
on startup. A plain `docker compose up` or `docker run` requires the database to
have already been migrated with both old writers stopped.

CI serializes production deployments and lets each active deploy finish before
starting the next one. Parallel deploys can race while replacing the same Compose
containers, causing a container-name conflict. When deploying manually, wait for
any CI deployment to finish first.

The pre-generator runs daily at 23:00 Europe/Madrid. On container startup, it
generates tomorrow's puzzle and clues only between 23:00 and midnight Madrid
time; earlier deployments skip generation and wait for the scheduled run.

To pre-generate historical puzzle snapshots:

```bash
docker compose --profile ops run --rm backfill
```

To regenerate AI clues for an existing puzzle using the deployed model, after
deploying the latest scheduler image:

```bash
docker compose run --rm --no-deps pre-generator pnpm clues:backfill --date YYYY-MM-DD --force
```

This replaces each stored clue only after its new generation succeeds. It leaves
the puzzle layout and player progress intact. Without `--force`, existing clues
are preserved. The command prints the model at startup and a
`puzzle_clue_generation_cost` summary with `estimatedCostUsd` and `failedWords`
at completion. Costs use reported token usage at published rates; requests that
fail without returning usage cannot be included. Logs contain slot IDs, not
answers or clue text.

## Available Scripts

- `pnpm run dev` - Start development server on port 3000
- `pnpm run build` - Build for production (automatically downloads dictionary if missing)
- `pnpm run preview` - Preview production build
- `pnpm run download-dict` - Force-refresh and rebuild the Catalan dictionary
- `pnpm run build-definitions` - Re-extract word definitions from the latest Viccionari dump
- `pnpm run db:migrate` - Apply Drizzle migrations
- `pnpm run backfill:puzzles` - Persist daily puzzle snapshots for a date range
- `pnpm run analyze:randomness` - Simulate daily generation and report letter/word repetition over time
- `pnpm run format` - Format code with Biome
- `pnpm run lint` - Lint code with Biome
- `pnpm run check` - Check code quality with Biome
- `pnpm run typecheck` - Check TypeScript types

### Randomness Analysis

Use the analysis script to measure how often letter sets and words repeat across a date range:

```bash
pnpm run analyze:randomness -- --days 90 --top 8
```

Useful flags:

- `--days <n>`: number of days to simulate, ending today by default
- `--from <YYYY-MM-DD>`: start from a specific date instead of ending today
- `--top <n>`: how many repeated letter sets and words to print
- `--monte-carlo-runs <n>`: rerun the crossword builder for the top repeated letter sets to estimate how "sticky" certain words are within the same six letters; use `0` to skip this slower section

## How It Works

### Dictionary Download

The build process automatically:
1. Fetches general lexical data from Softcatalà's `catalan-dict-tools` repository
2. Combines nouns, adjectives, verbs, adverbs, and lemma frequency data
3. Filters to crossword-friendly entries (4-12 letters, alphabetic, corpus frequency >= 20)
   that have a definition in `src/data/catalan-definitions.json`
4. Saves the result to `src/data/catalan-words.json` (currently ~16k words)

Guesses are still checked against every Softcatalà word of 4-12 letters, with
or without a definition.

### Word Definitions

`src/data/catalan-definitions.json` holds up to four senses per puzzle-eligible
word, extracted from the [Viccionari](https://ca.wiktionary.org/) dump
(CC BY-SA 4.0). The AI clue prompt includes them so the model writes clues from
the real meaning instead of guessing. The extraction:

- Keeps the Catalan section only and tags each sense with its part of speech
- Drops senses that only point at another form (`{{ca-forma-conj}}`,
  `{{forma-f}}`, ...) or mark a missing definition (`{{sense accepcions}}`)
- Replaces a sense that only names a synonym with that synonym's first
  definition, or drops it when the synonym has none

Words left without any sense never appear in puzzles. The file is committed
because Wikimedia deletes old dumps after a few months. Regenerate it (needs
`bzip2` on the PATH), then rebuild the word lists:

```bash
pnpm run build-definitions
pnpm run download-dict
```

### Crossword Generation

The crossword generator:
- Randomly selects 10-15 valid words
- Places the first word horizontally
- Finds intersections for subsequent words
- Ensures all words cross with at least one other word
- Creates a compact grid layout
- Falls back to simpler layouts if complex generation fails

### Word Matching

- User input is normalized (accents removed, lowercase)
- Dictionary words are stored with proper spelling
- Matching is accent-insensitive
- Display shows correctly spelled words

### Word Selection Quality

- The dictionary source is a general lexicon instead of a terminology database
- Low-frequency words are filtered out during the build step (currently `frequency >= 20`)
- Words without a Viccionari definition are filtered out, which also drops most
  proper nouns and foreign words from the Softcatalà lists
- Puzzle generation prefers more common words, while keeping some randomness

### Reddit Daily Post

Each day's puzzle is posted to [r/garbuix](https://www.reddit.com/r/garbuix/) as
an image post titled `Garbuix #<number> - <d/m/yyyy>`. Numbers count Madrid days
from `FIRST_PUZZLE_DATE_KEY` in `src/lib/puzzle-number.ts` (#1).

The image is the share card with every cell hidden: the board's shape and the
day's letters, rendered on the server with `@napi-rs/canvas` and the bundled
Nunito font. The in-app share image uses the same renderer in
`src/lib/puzzle-card.ts`, with the player's found cells filled in. Both always use
the dark theme, with the logo, wordmark and letters in the brand teal, and draw
cells as squircles like the board. The post is pinned (the previous day's post is
unpinned), and its stickied first comment links to the game.

- `GET /api/daily-post` returns today's `dateKey`, post title and image path,
  or `503` while today's puzzle is still being generated.
- `GET /api/daily-image/<yyyy-mm-dd>.png` returns the card for today or any past
  day with a stored puzzle, and `404` for future days.

Reddit closed self-service API keys in November 2025, so the poster is a Devvit
app in `reddit-app/` that runs on Reddit's servers. See its README for setup.

## Technologies

- **[TanStack Start](https://tanstack.com/start)** - Full-stack React framework
- **[TanStack Router](https://tanstack.com/router)** - Type-safe routing
- **[React 19](https://react.dev/)** - UI library
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Styling
- **[shadcn/ui](https://ui.shadcn.com/)** - UI components
- **[Lucide React](https://lucide.dev/)** - Icons
- **[Vite](https://vitejs.dev/)** - Build tool
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety

## Development Notes

### Build version

The menu's **Sobre el joc** page shows the same `garbuix@<version>` release used in error reports.
The release is embedded in the app, so an older open tab still shows its own
version. Builds prefix the version from `SENTRY_RELEASE` or Git with `garbuix@`;
without either, they use `garbuix@dev`.

The generated `/version.json` manifest also contains a separate hash of the
service worker and its precached assets. Only changes to those files trigger
the service-worker update prompt; ordinary app releases do not.

### Database integration tests

`pnpm test` runs the unit and component suites. To also run the PostgreSQL
persistence tests, point `TEST_DATABASE_URL` at a disposable test database:

```bash
docker run --rm --name garbuix-test-db -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=garbuix_test -p 127.0.0.1:55432:5432 postgres:17-alpine
# In another terminal:
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:55432/garbuix_test pnpm test
```

The integration suite applies the repository's migrations and removes its test
records afterward. It never uses `DATABASE_URL` as a fallback. Without
`TEST_DATABASE_URL`, those tests are skipped. CI supplies a PostgreSQL service
and runs them with the rest of the suite.

### Adding New UI Components

Use shadcn CLI to add components:

```bash
pnpm dlx shadcn@latest add [component-name]
```

### Code Style

This project uses `@/` path aliases for imports:
```typescript
import { Button } from "@/components/ui/button"
import { generateCrossword } from "@/lib/crossword-generator"
import allWords from "@/data/catalan-words.json"
```

The `@/` alias maps to the `src/` directory (configured in `tsconfig.json`).

### Dark Mode

The app supports dark mode with automatic system preference detection:

- **System Default**: Follows your OS dark mode setting
- **Manual Toggle**: Click the sun/moon icon in the header to override
- **Persistent**: Your preference is saved to localStorage

The theme is managed by `ThemeProvider` in `src/components/theme-provider.tsx`.

### Customizing Crossword Generation

Edit `src/lib/crossword-generator.ts` to adjust:
- Word length filters (default: 4-12 characters)
- Number of placement attempts (default: 50)
- Grid size constraints
- Intersection requirements

### Updating the Dictionary

The build only downloads the dictionary if `src/data/catalan-words.json` is missing.
To force a refresh from the upstream source:

```bash
pnpm run download-dict
```

This will fetch the latest source files from Softcatalà and rebuild the local JSON.

## Contributing

Contributions are welcome! Feel free to submit pull requests or open issues.

## Acknowledgments

- **Softcatalà** for maintaining and publishing open Catalan lexical data
- **Viccionari** contributors for the Catalan definitions (CC BY-SA 4.0)
- **TanStack** team for the amazing React tools
- **shadcn** for the beautiful UI components
