# Garbuix

A responsive web application for a Catalan crossword-style word game.

## Features

- 🎮 Interactive crossword puzzle game with Catalan words
- 📚 Uses a general Catalan lexicon from [Softcatalà](https://github.com/Softcatala/catalan-dict-tools)
- 🎯 5-15 words per game, all crossing with each other
- 🔤 Guess words without accents, see them properly spelled
- 📱 Fully responsive design
- 🎨 Modern UI with Tailwind CSS and shadcn/ui components
- 🌓 Dark mode with system preference detection and manual toggle

## How to Play

### Garbuix mini

`/mini` is a separate daily game for early readers, also available in the menu.
Each board has five connected words drawn from the curated Catalan vocabulary in
`src/data/mini-words.ts`. All words have 3–5 letters. Hints reveal one hidden cell
per tap, with no limit, descriptive clues, or leaderboard.

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

Sentry captures browser errors, caught router errors, server request errors, and
server function errors in the `clotet/garbuix` project. The client initializes
before hydration. `pnpm dev` and `pnpm start` preload the server SDK, and
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
See [privacy operations](docs/privacy-operations.md) for the proposed
legitimate-interest assessment and remaining Sentry account settings to verify.

Source-map uploads are optional. Export `SENTRY_AUTH_TOKEN` before `pnpm build`
to upload maps. Without a token, uploads and Sentry's map generation are disabled.
Releases use the current commit's short SHA, such as `a1b2c3d4`. The deployment
script passes it into Docker, and the build records the same release for
source-map uploads, browser errors, server errors, and the about page. Local builds read Git
directly. Builds without Git metadata can set `SENTRY_RELEASE`; otherwise they
use `dev`. The release is saved with the build, so no runtime
release variable is needed.

For direct Docker builds, pass the release as a build argument and the token as
a BuildKit secret:

```bash
docker build --target production --build-arg SENTRY_RELEASE="$(git rev-parse --short=8 HEAD)" --secret id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN -t paraules-app:prod .
```

For the standard Compose deployment, set `SENTRY_AUTH_TOKEN` in the deployment
server's `.env` file. Compose passes it to the app, scheduler, and backfill builds
as a BuildKit secret. A GitHub Actions secret alone is not forwarded to the remote
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

Check the build logs for Sentry's successful upload message; a cached build does
not rerun the upload.

To verify delivery after a deployment, exercise an error from a real browser
interaction and one from a server request/function. Confirm both events in
`clotet/garbuix`, with the production environment, expected release and original
source locations. Exception messages are preserved, so search for the original
message and use the event ID, time and stack location to identify each report.
Message-only events from `captureMessage` are intentionally dropped.

Configure production alerts for new issues and resolved issues that recur, and
verify the intended recipient actually receives the test notification. Repeating
an unresolved issue does not trigger a new-issue alert. Check Sentry's quota and
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

Build both production images, stop the app and clue scheduler, apply migrations,
then recreate both services from the new images. Stopping both writers before
migrating prevents old code from querying removed columns. The app is briefly
unavailable during migration and restart. If migration fails, both services stay
stopped so the failure can be resolved before restarting.

```bash
sh scripts/deploy-compose.sh
```

Use this script for production updates. A plain `docker compose up` can start the
clue scheduler before the app finishes migrating the database.

CI serializes production deployments and lets each active deploy finish before
starting the next one. Parallel deploys can race while replacing the same Compose
containers, causing a container-name conflict. When deploying manually, wait for
any CI deployment to finish first.

To pre-generate historical puzzle snapshots:

```bash
docker compose --profile ops run --rm backfill
```

## Available Scripts

- `pnpm run dev` - Start development server on port 3000
- `pnpm run build` - Build for production (automatically downloads dictionary if missing)
- `pnpm run preview` - Preview production build
- `pnpm run download-dict` - Force-refresh and rebuild the Catalan dictionary
- `pnpm run db:migrate` - Apply Drizzle migrations
- `pnpm run backfill:puzzles` - Persist daily puzzle snapshots for a date range
- `pnpm run backfill:difficulty` - Fill in the 1-3 star difficulty for stored puzzles (defaults to today + yesterday)
- `pnpm run analyze:randomness` - Simulate daily generation and report letter/word repetition over time
- `pnpm run analyze:difficulty` - Simulate daily generation and report the difficulty (star) distribution over time
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
3. Filters to crossword-friendly entries (4-12 letters, alphabetic, common enough to be useful)
4. Saves the result to `src/data/catalan-words.json` (currently ~14.5k words)

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

### Difficulty Rating

Each daily puzzle gets a 1-3 star difficulty based mainly on word rarity, with
a small increase when its letters allow more valid guesses:

- The base score is the mean `log10(frequency)` of the puzzle's words. The generator
  biases word selection toward common words, so a lower mean means rarer words
  and a harder puzzle.
- Count distinct valid guesses from the full guess dictionary, including bonus
  words, using the same letter and normalization rules as gameplay. Subtract
  `min(0.15, 0.05 * log2(max(count, 30) / 30))` from the base score. This adds
  0.05 per doubling above 30 guesses and stops increasing at 240 guesses.
- The original frequency thresholds remain 3.59 for easy and 3.30 for medium.
  The modifier is smaller than the gap between them, so it can raise a rating
  by at most one level. Rare-word puzzles stay hard even with few valid guesses.
- The rating is stored on the puzzle row and shown as a 1-3 bar indicator
  (green/amber/red, with a label) on today's puzzle and on the previous-days
  history.

Check the distribution (and re-tune the thresholds if it drifts) with:

```bash
pnpm run analyze:difficulty -- --days 365
```

Stored puzzles are rescored when opened. To update ratings across history and
leaderboards without opening each puzzle, run the backfill after deploying the
new formula. It updates both the database column and public snapshot:

```bash
pnpm run backfill:difficulty            # today + yesterday
pnpm run backfill:difficulty -- --all   # every stored puzzle
pnpm run backfill:difficulty -- --from 2026-01-01 --to 2026-01-31
```

### Word Selection Quality

- The dictionary source is a general lexicon instead of a terminology database
- Low-frequency words are filtered out during the build step (currently `frequency >= 200`)
- Puzzle generation prefers more common words, while keeping some randomness

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

The menu's **Sobre el joc** page shows the same short commit SHA used by Sentry.
The release is embedded in the app, so an older open tab still shows its own
version. Builds read `SENTRY_RELEASE` or Git; without either, they use `dev`.

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
- **TanStack** team for the amazing React tools
- **shadcn** for the beautiful UI components
