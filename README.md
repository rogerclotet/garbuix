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

### Observability

#### GlitchTip

GlitchTip runs independently of PostHog and Umami. Set the project DSN at
runtime, then restart the app. Docker Compose passes these settings through.
The public browser configuration is embedded in the SSR document, so changing
the DSN does not require rebuilding the image.

```dotenv
GLITCHTIP_DSN=https://PUBLIC_KEY@glitchtip.example.com/1
GLITCHTIP_ENVIRONMENT=production
GLITCHTIP_TRACES_SAMPLE_RATE=0.1
GLITCHTIP_ENABLE_LOGS=false
```

Leaving the DSN blank disables reporting. The integration captures browser
exceptions and rejected promises before hydration, React/router errors,
server-function and API failures, unhandled Node errors, and errors explicitly
reported through `useObservability()` or `captureServerException()`. Server
`console.error` calls are captured too, including errors handled internally by
React's streaming renderer. `pnpm dev` and `pnpm start` preload the SDK before
application dependencies load. Use `pnpm start` for production instrumentation.
The nightly scheduler's puzzle and clue backfill commands preload it too, and
flush queued reports when those processes exit.

Errors include breadcrumbs, the build release, environment, and a `runtime`
tag distinguishing `browser` from `server`. Signed-in browser users are
identified by their account ID only. Request bodies, headers, cookies and
query strings are removed from error/transaction request metadata. Avoid
putting secrets in error messages, breadcrumbs, custom properties or logs.

Performance sampling defaults to 10%, including page loads, navigations,
requests, and actions wrapped in `observeServerAction()`. Set the rate to `0`
to disable traces or `1` while verifying the setup. Error capture is independent
of this rate. SDK session tracking and client reports are disabled; replay,
profiling and feedback widgets are not enabled.

[GlitchTip 6.1 and later support structured logs](https://glitchtip.com/blog/2026-03-23-glitchtip-6-1-released/).
Set `GLITCHTIP_ENABLE_LOGS=true` to send `console.warn`/`console.error` as logs
and enable explicit structured logging in browser or server code:

```ts
import { logger } from "@sentry/tanstackstart-react";

logger.info("Puzzle generation completed", { date_key: dateKey });
```

Browser envelopes use `/api/monitoring`, which only forwards to the configured
DSN, limits bodies to 1 MiB, and preserves GlitchTip's rate-limit headers. It
does not forward app cookies or follow upstream redirects. This works with the
app's existing same-origin Content Security Policy. The app server must be able
to POST to GlitchTip's `/api/1/envelope/`, using the project ID from the DSN.
If GlitchTip is behind Pangolin or another login gateway, give that ingest path
non-interactive access. Source-map upload API calls must also reach GlitchTip
with their bearer token, rather than redirecting to the gateway's login page.

To upload source maps automatically during `pnpm build`, add:

```dotenv
GLITCHTIP_URL=https://glitchtip.example.com
GLITCHTIP_ORG=your-organization-slug
GLITCHTIP_PROJECT=your-project-slug
GLITCHTIP_AUTH_TOKEN=your-token
```

Use a token with `project:releases` and `org:read`. These values are build-only;
the auth token never enters public runtime configuration. Compose mounts `.env`
as a BuildKit secret for the upload step instead of copying it into the image.
For direct Docker builds, pass `--secret id=glitchtip_env,src=.env`.

The build adds matching debug IDs to the deployed JavaScript and maps. It
composes both stages of server maps back to the original TypeScript. Browser
maps and copies of their matching JS live in `.output/sourcemaps/client`,
outside the served `.output/public` directory; server maps stay with the server
chunks. Without an upload token, builds still prepare these files privately.
Upload an existing build later with `pnpm glitchtip:upload`. Configured upload
failures stop the build before the deployment script stops the running app.

Events and uploads use `garbuix@<version>` from `version.json`. If you override
`APP_VERSION`, give each distinct build a unique value. Keep `.output/server`,
`.output/sourcemaps`, and `.output/public` from the same build together.

To verify delivery, trigger a browser error with
`setTimeout(() => { throw new Error("GlitchTip browser test"); }, 0)` in the
browser console. In GlitchTip, check the event's release, environment and
`runtime` tag. For source-map verification, temporarily throw from a known
line in app code, build/upload, and confirm that line resolves to TS/TSX. Remove
the test throw afterward. A quick server transport check is:

```bash
node --import ./instrument.server.ts --input-type=module -e '
  import * as Sentry from "@sentry/tanstackstart-react";
  Sentry.captureException(new Error("GlitchTip server test"));
  await Sentry.flush(5000);
'
```

In GlitchTip, create a [GET uptime monitor](https://glitchtip.com/documentation/uptime-monitoring/)
for `https://your-app/api/health`, expecting status 200. This checks the running
HTTP server. Monitor `/` as well if you want failures of the rendered page and
its database dependencies to count as downtime. Configure project alerts in
GlitchTip to receive error and downtime notifications.

#### PostHog and Umami

PostHog is optional. To enable it, set these runtime variables in `.env` before starting the app:

```bash
POSTHOG_KEY=phc_xxx
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_UI_HOST=https://us.posthog.com
```

`POSTHOG_UI_HOST` is optional, but it helps PostHog link events back to the right project UI region.

Umami is also optional and can run alongside PostHog or on its own. Set both
runtime variables to enable it, then restart the app:

```bash
UMAMI_HOST=https://analytics.example.com
UMAMI_WEBSITE_ID=00000000-0000-4000-8000-000000000000
```

Use your Umami server's base URL and the website ID from its tracking settings.
These variables are passed to the app, scheduler, and backfill containers by
Docker Compose. No rebuild or Umami API token is needed to change them. Leaving
either variable empty disables Umami.

Umami receives the existing product action names with only reviewed counts,
booleans, and fixed choices. Both browser and server paths filter event data;
new event names and properties must be added to `src/lib/umami-events.ts` after
review. Errors, web vitals, free text, and unknown events are not sent to Umami.
`$pageview` becomes a native Umami pageview. Only known page paths are retained;
query strings, fragments, referrers, and page titles are discarded.

Compare the two games with `game_mode=classic` or `game_mode=mini`. Both emit
`puzzle_loaded`, `puzzle_guess_result`, `puzzle_completed`,
`puzzle_letters_shuffled`, `puzzle_hint_requested`, and `puzzle_events_synced`.
The shared hint event includes `hint_type=text` for Classic and `hint_type=letter`
for Mini. Mini syncs snapshots, so its sync events report progress counts rather
than Classic's event-batch counts.
Puzzle generation, server progress sync, history loads, and game pageviews are
also tagged with the game mode. The gameplay events contain no submitted guesses
or answer text.

Umami never receives account IDs, application device IDs, names, email addresses,
or avatars from this integration. Browser requests use no cookies or referrer
and go through `/api/u`. The endpoint accepts events only and filters their
properties again before sending them to the configured server's `/api/send`.

For Umami's standard anonymous visitor counting, the proxy forwards the visitor's
User-Agent and IP headers (`X-Forwarded-For`, `X-Real-IP`, and `CF-Connecting-IP`).
Your reverse proxy must supply the actual visitor IP. These are processed by
Umami to derive its anonymous session ID, with no `identify()` calls or account
linking. Umami's opaque cache token is returned to the browser and reused in
memory to preserve visits across events; it is not stored in cookies or local
storage. Request-backed server events use the same visitor headers. Background
jobs have no visitor context, and server events use `/server` as their page path.

Unique visitors are estimates, not exact device or person counts. Network/browser
changes and Umami's salt rotation can split one visitor; matching browsers on a
shared IP can merge different visitors. See [Umami's session and metric definitions](https://docs.umami.is/docs/metric-definitions).
PostHog's existing identification, feature flags, and observability remain unchanged.

### Production

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
