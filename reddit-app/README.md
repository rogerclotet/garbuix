# garbuix-bot

garbuix-bot posts the daily Garbuix puzzle to r/garbuix, so the community has
one thread a day to talk about it. Garbuix is a free Catalan crossword game
with a new puzzle every day.

The bot is for the moderators of r/garbuix and is installed only there. Once
installed it needs no setup and nobody has to interact with it.

## What it does

Just after midnight Madrid time, the bot submits a text post as
u/garbuix-bot. The title is the puzzle's number and date, for example
`Garbuix #212 - 8/10/2026`, and the body is empty.

The post has no link and the bot doesn't comment on it. It's a place for
players to discuss the puzzle.

The bot pins the new post and unpins the previous day's post. It only unpins
posts it pinned itself, so posts pinned by moderators stay where they are.

That's all it does. It doesn't read, store or reply to anyone's posts or
comments, and it makes no requests outside Reddit. In Redis it keeps only the
IDs of its own posts, so it knows whether it has already posted today and which
post to unpin tomorrow.

### Operational notes

- Keep one pin slot free for the daily post. If both slots are taken by other
  posts, pinning fails and the bot tries again every minute.
- If a moderator deletes the day's post, the bot doesn't post it again that
  day.
- The bot goes by the clock and doesn't check garbuix.app. If the site is down
  at midnight, the post still goes up.

## Installing it on r/garbuix

1. Open https://developers.reddit.com/apps/garbuix-bot while logged in as a
   moderator of r/garbuix.
2. Install the app on r/garbuix. It has no settings.
3. The first post goes up at the next midnight in Madrid. If today has no post
   yet, it goes up within a minute of installing.

To stop the daily posts, uninstall the app from the same page.

## For developers

This directory is separate from the web app. It has its own dependencies,
lockfile and tests, and it isn't part of the Docker image. The one shared
file is `src/lib/puzzle-number.ts`, which the bot imports for the post title,
so the numbering always matches the site.

```bash
cd reddit-app
pnpm install
pnpm exec devvit login   # with an account that moderates r/garbuix

pnpm test        # unit tests (node:test)
pnpm typecheck
pnpm logs        # stream the app's logs from r/garbuix
pnpm run upload  # typecheck, test and upload a new version
```

CI uploads a new build on every push to `main` that touches this directory or
`src/lib/puzzle-number.ts` (`.github/workflows/reddit-app.yml`). It logs in with the `DEVVIT_AUTH_TOKEN`
repository secret, which holds the contents of `~/.devvit/token` after
`devvit login`. `pnpm run upload` is still there for uploading by hand.

The first upload registered the name `garbuix-bot`, which is also the bot
account's username. The app's details are at
https://developers.reddit.com/apps/garbuix-bot.

A scheduled task runs every minute (`devvit.json`). The posting logic is in
`src/daily-post.ts`, and `src/index.ts` connects it to Reddit and Redis. A
Redis lock stops two overlapping runs from posting twice. A run that fails
releases the day for another attempt after about ten minutes.
