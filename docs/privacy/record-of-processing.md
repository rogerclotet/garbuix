# Record of processing activities

GDPR art. 30 and LOPDGDD art. 31. The under-250-employees exemption doesn't
apply, because the processing isn't occasional. Last reviewed: 24 October 2026.

Controller: Roger Clotet, roger@clotet.dev. No data protection officer is
required (GDPR art. 37, LOPDGDD art. 34).

Hosting: a VPS at OVHcloud (OVH SAS, France) in the EU, behind a Pangolin
reverse proxy with request log retention turned off. Postgres and Redis run on
the same host. OVHcloud is a processor under the data processing terms of its
contract; nothing hosted there leaves the EU.

## Activities

### 1. Guest play

- Purpose: let people play without an account, appear on the leaderboard and
  exchange clues.
- Basis: art. 6.1.b, the service the player asks for.
- Data: random guest id in the signed `garbuix_guest` cookie; guest name;
  word, try and clue counts reported to the leaderboard. Progress and history
  stay in the browser.
- Recipients: none.
- Retention: guest cookie 395 days from minting; leaderboard 48 hours after the
  last update.

### 2. Accounts and sign-in

- Purpose: sign in with Google or an emailed code and keep progress across
  devices.
- Basis: art. 6.1.b.
- Data: name, display name, email, avatar URL, Google account id and tokens,
  sessions with IP address and user agent, one-time codes.
- Recipients: Google, when the player chooses Google sign-in; Resend, which
  delivers the codes.
- Transfers: Google and Resend may process in the US. Check each one's DPF
  certification or SCCs.
- Retention: account data until the account is deleted; sessions 7 days from
  last use (Better Auth default); codes 10 minutes.

### 3. Progress and history for accounts

- Purpose: save and sync each game's progress and history.
- Basis: art. 6.1.b.
- Data: per-puzzle progress (guess hashes, found words, clues, tries,
  completion time), progress events with the client device id, imported guest
  history.
- Recipients: none.
- Retention: until the account is deleted.

### 4. Leaderboard

- Purpose: show the day's classic ranking to every player.
- Basis: art. 6.1.b.
- Data: display name, avatar, words found, clues, tries and finish time.
  Public to everyone viewing the day's board.
- Recipients: other players.
- Retention: Redis, 48 hours after the last update.

### 5. Peer clues

- Purpose: let players ask others for a clue and answer.
- Basis: art. 6.1.b.
- Data: requester and responder participant ids, word ids, clue text, the
  count of clues given on the account.
- Recipients: the player who asked.
- Retention: open requests 3 hours, delivered clues 24 hours in Redis; for
  accounts, the ids of words a friend helped with stay in the progress record,
  and the clues-given count stays on the account.

### 6. Error reports

- Purpose: find and fix failures.
- Basis: art. 6.1.f, keeping the game working; players can object.
- Data: exception type and message, code locations, release, time. Request
  data, account data, cookies and breadcrumbs are stripped by
  `sentry-privacy.ts`. The receiving server sees the connection's IP address.
- Recipients: self-hosted GlitchTip.
- Retention: 90 days.

### 7. Abuse limits

- Purpose: stop floods of leaderboard reports, clue requests and clue
  generation.
- Basis: art. 6.1.f, protecting the service.
- Data: IP address and account or guest id in rate-limit counters. Better
  Auth also limits sign-in requests per IP address, in memory.
- Recipients: none.
- Retention: Redis, the length of each window, at most 1 hour; Better Auth's
  counters last seconds.

### 8. Usage statistics

- Purpose: count players and finished puzzles per game and day.
- Basis: art. 6.1.f; consent exemption under LSSI art. 22.2 per the AEPD's
  audience-measurement guide. See [usage-statistics.md](usage-statistics.md).
- Data: on our server, the account or guest id, turned into a daily HMAC.
  PostHog receives only the game, the puzzle date and that daily id.
- Recipients: PostHog Cloud EU, as a processor, with a signed DPA.
- Transfers: none of personal data.
- Retention: daily key 48 hours; PostHog events at most 25 months.

### 9. AI clues

Anthropic generates clues from dictionary words. No player data is sent, so
this isn't processing of personal data.

### 10. Reddit

The garbuix-bot app posts the daily thread on r/garbuix and stores only its
own post ids. It reads no Reddit user data.

## Security measures

- HTTPS only, HSTS, a strict Content Security Policy.
- Guest identity in a signed HttpOnly cookie; sessions managed by Better Auth.
- Secrets in the server's environment, never in the browser bundle.
- Error reports filtered by an allowlist before they leave the app.
- Rate limits on every write endpoint.
