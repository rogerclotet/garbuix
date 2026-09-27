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

Container dependencies live in the `app_node_modules` Docker volume, separately
from your local `node_modules`. Startup installs run noninteractively so pnpm can
refresh that volume after upgrades without waiting for confirmation.

### Observability

#### PostHog error tracking

Set `POSTHOG_KEY` and `POSTHOG_HOST` to enable browser and server error reporting,
independently of `ANALYTICS_ENABLED`; leave the key blank to disable it locally.
`POSTHOG_ENVIRONMENT` labels reports and defaults to `NODE_ENV`.

The browser uses PostHog's stack parser without loading its analytics SDK and
sends errors through `/api/monitoring` without cookies or a referrer. The server
sends `$exception` events with a fresh ID for each report, no person profiles,
and no geo-IP enrichment. Reports contain error types, redacted messages, stack
frames, build version and runtime, with no user/session IDs, request payloads,
URLs, breadcrumbs, replay, general console logs or performance tracing.
Do not put personal information in error messages; redaction cannot recognize
every possible name or sensitive value.

Uncaught browser errors, unhandled rejections, React/router errors, server
functions, API failures, server-rendering errors and explicit capture calls are
covered. Incoming client disconnects and usage-collection errors are excluded.
Repeated captures of the same Error object are deduplicated in memory; reporting
is capped at 10 errors/minute per page and 100/minute per server process.

To upload source maps during `pnpm build`, configure:

```dotenv
POSTHOG_CLI_HOST=https://eu.posthog.com
POSTHOG_CLI_PROJECT_ID=your-project-id
POSTHOG_CLI_API_KEY=your-personal-api-key
```

Use a personal API key with **error tracking write** and **organization read**
scopes, for the same project as `POSTHOG_KEY`. The CLI host is the PostHog UI/API
host, while `POSTHOG_HOST` is the ingestion host. See [PostHog's CLI setup](https://posthog.com/docs/error-tracking/upload-source-maps/cli).

Docker mounts `.env` as the build-only `posthog_env` secret. Tokens stay out of
browser bundles and image layers. Builds inject PostHog chunk IDs into the
actual deployed JavaScript, compose Nitro's two server build stages back to
TypeScript, and move client maps to `.output/sourcemaps/client` outside the
public directory. Upload failures fail the build; without an API key, maps are
prepared locally and uploading is skipped. Upload the same build later with
`pnpm posthog:upload`, keeping `.output/server`, `.output/public` and
`.output/sourcemaps` together. Configure error retention and alerts in PostHog.

To verify delivery, throw an error from the browser console and check PostHog's
Error Tracking view; verify source maps with an error thrown from built app code
(console snippets have no uploaded source map).
The existing `/api/health` endpoint remains available for external uptime checks.

#### Anonymous daily usage

Usage collection does not load the PostHog analytics SDK. It sends an explicit, validated action to
`/api/usage` without cookies or a referrer. The server increments a daily counter
without recording individual events, account IDs, browser IDs or session IDs.
At 00:15 Europe/Madrid the scheduler sends completed daily totals to PostHog.

Collection is **off by default**, including when old PostHog keys are present.
To enable daily aggregate collection:

```dotenv
ANALYTICS_ENABLED=true
POSTHOG_KEY=phc_aggregate_project_key
POSTHOG_HOST=https://eu.i.posthog.com
```

Set these variables on both the app and scheduler. Apply migration `0010` first.
`pnpm analytics:export` retries completed days and purges local counters older
than 90 days. PostHog retention must also be configured to at most 90 days.
Charts must sum the `count` property of `daily_usage` events. The user notice
lives at `/privacitat`; no consent popup is added.

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

The menu's **Sobre el joc** page shows the version embedded in the running app.
Production builds generate a 16-character content hash from the source, public
assets, and build inputs. Identical inputs produce the same version, with no
manual version bump. It also identifies the release in PostHog.

`APP_VERSION` can override the hash at build time. The generated manifest is
available at `/version.json`; the About page uses the bundled value so an older
open tab still shows its own version. Without a generated manifest, local
development shows `dev`.

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
