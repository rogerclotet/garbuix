# garbuix-bot

garbuix-bot posts the daily Garbuix puzzle to r/garbuix, so the community has
one thread a day to talk about it. Garbuix is a free Catalan crossword game
with a new puzzle every day.

The bot is for the moderators of r/garbuix and is installed only there. Once
installed it needs no setup and nobody has to interact with it.

## What it does

Shortly after midnight Madrid time, the bot submits an image post as
u/garbuix-bot:

- The title is the puzzle's number and date, for example
  `Garbuix #212 - 8/10/2026`.
- The image is that day's empty board, the same thing a player sees before
  their first guess. It doesn't show any answers.

The post has no link and the bot doesn't comment on it. It's a place for
players to discuss the puzzle.

The bot pins the new post and unpins the previous day's post. It only unpins
posts it pinned itself, so posts pinned by moderators stay where they are.

That's all it does. It doesn't read, store or reply to anyone's posts or
comments. In Redis it keeps only the IDs of its own posts, so it knows whether
it has already posted today and which post to unpin tomorrow.

### Operational notes

- Keep one pin slot free for the daily post. If both slots are taken by other
  posts, pinning fails and the bot tries again every minute.
- If a moderator deletes the day's post, the bot doesn't post it again that
  day.
- If garbuix.app is down, the bot keeps retrying and posts once it gets an
  answer. Nothing goes up that day if garbuix.app stays down.

## Fetch Domains

The following domains are requested for this app:

- `garbuix.app` - The bot downloads the day's title and board image from
  garbuix.app. The garbuix.app server generates the puzzle each day and stores
  it, so the bot has no other way to get it.

The bot makes two GET requests a day. The first one, to `/api/daily-post`,
returns the title and the image path, and the second downloads that PNG. Until
the new puzzle is ready, the first request is repeated once a minute, which
usually takes a minute or two after midnight. After the post is up, the bot
makes no more requests until the next day.

Both endpoints are public and need no login. The requests carry no body and no
Reddit data: no usernames, no post content, nothing about who installed the
app. The bot uploads the image to Reddit, so the post never loads anything
from garbuix.app.

Terms: https://garbuix.app/condicions
Privacy policy: https://garbuix.app/privacitat

## Installing it on r/garbuix

1. Open https://developers.reddit.com/apps/garbuix-bot while logged in as a
   moderator of r/garbuix.
2. Install the app on r/garbuix. It has no settings.
3. The first post goes up at the next midnight in Madrid. If today has no post
   yet, it goes up within a minute of installing.

To stop the daily posts, uninstall the app from the same page.

## For developers

This directory is separate from the web app. It has its own dependencies,
lockfile and tests, and it isn't part of the Docker image.

```bash
cd reddit-app
pnpm install
pnpm exec devvit login   # with an account that moderates r/garbuix

pnpm test        # unit tests (node:test)
pnpm typecheck
pnpm logs        # stream the app's logs from r/garbuix
pnpm run upload  # typecheck, test and upload a new version
```

The first upload registered the name `garbuix-bot`, which is also the bot
account's username. Every upload sends `garbuix.app` for fetch review. In the
app's details at https://developers.reddit.com/apps/garbuix-bot, the terms and
privacy links above have to be filled in, because the app uses fetch.

A scheduled task runs every minute (`devvit.json`). The posting logic is in
`src/daily-post.ts`, and `src/index.ts` connects it to Reddit, Redis and media
uploads. A Redis lock stops two overlapping runs from posting twice. A run
that fails releases the day for another attempt after about ten minutes.
