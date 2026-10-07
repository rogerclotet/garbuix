# garbuix-bot

Devvit app that posts each day's Garbuix to r/garbuix. It runs on Reddit's
servers. Every minute it checks whether today's post (Europe/Madrid date) exists. If
not, it asks `https://garbuix.app/api/daily-post` for the title and image, uploads
the image to Reddit and submits an image post as u/garbuix-bot. Its first
comment links to garbuix.app and is distinguished and stickied as a moderator
comment, so it stays on top. The first post lands within about a minute of midnight. A Redis marker keeps it
to one post per day, and failed runs retry about ten minutes later.

Each new post is pinned and the previous day's post is unpinned. Only posts the
bot pinned itself are unpinned, so other pinned posts stay where they are, as long as
one pin slot is left for the daily post.

This directory is separate from the web app: it has its own dependencies,
lockfile and tests, and is not part of the Docker image.

## Setup

1. Install dependencies and log in with the Reddit account that moderates
   r/garbuix:

   ```bash
   cd reddit-app
   pnpm install
   pnpm exec devvit login
   ```

2. Upload the app. The first upload registers the name `garbuix-bot`, which also
   becomes the app account's username. It also submits `garbuix.app` for HTTP fetch review,
   which usually takes 1–2 business days:

   ```bash
   pnpm run upload
   ```

3. In the app's page on https://developers.reddit.com/apps/garbuix-bot, add links
   to the terms and privacy policy (required for apps that use HTTP fetch).

4. Once the domain is approved, install the app on r/garbuix from the same page
   (or with `pnpm exec devvit install garbuix`). The scheduled task starts
   running on install.

## Day to day

```bash
pnpm test        # unit tests (node:test)
pnpm typecheck
pnpm logs        # stream the app's logs from r/garbuix
pnpm run upload  # typecheck, test and upload a new version
```
