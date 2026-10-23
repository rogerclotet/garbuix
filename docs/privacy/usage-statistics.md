# Usage statistics: assessment

Last reviewed: 24 October 2026. Review again by October 2027, or sooner if
anything below changes.

This page records why Garbuix may count players without asking for consent,
and checks the setup against the conditions that make that possible. GDPR art.
5(2) asks the controller to be able to show this. The code is
`src/lib/usage-stats.server.ts`, and the privacy policy section is
"Estadístiques d'ús" in `src/routes/privacitat.tsx`. Change all three together.

## What is collected

For each game (classic, Mini, Síl·labes, Quadrat) and puzzle date, the server
records two events per player: `puzzle_started` after the first guess and
`puzzle_completed` after the last word. Each event goes to PostHog Cloud EU
with three fields: the game, the puzzle date, and a player id for that day.

The player id is `HMAC-SHA256(dayKey, "user:<account id>")` or
`HMAC-SHA256(dayKey, "guest:<guest id>")`. `dayKey` is 32 random bytes per
puzzle date, held only in Redis, which deletes it 48 hours after it was made.
Nothing stores which id belongs to which player.

The server counts from requests the game already makes:

- signed-in players: the progress sync of each game
- classic guests: the leaderboard report
- Mini, Síl·labes and Quadrat guests: `POST /api/guest-progress`, which sends
  the game, the date and whether the puzzle is finished. The server counts it
  and stores nothing.

PostHog never receives an IP address, a user agent, an account or guest id, a
display name or a guess. The server sends the events itself, so the player's
browser never contacts PostHog.

## Legitimate interest assessment (GDPR art. 6.1.f)

Purpose. Knowing how many people play each game each day, how many finish,
and how many play more than one game. These numbers decide which games to keep
and improve. It is a real and present interest of the controller.

Necessity. The leaderboard already gives a player count for the classic game,
but only for players who reach it, and the other three games have no
equivalent for guests. Daily unique counts need a way to recognise the same
player twice in one day, which is all the daily id does. It can't link days,
which rules out retention and weekly or monthly totals. That limit is
deliberate.

Balancing. Players expect a free web game to know roughly how many people
play it. The data says nothing about a person beyond "played this game today
and finished or not", can't be tied back to them by us after two days or by
PostHog at any time, and is never used to decide anything about an individual.
Some players are likely children, which weighs against intrusive processing;
this processing is not intrusive, and it needs no consent that a child under
14 could not give (LOPDGDD art. 7). Safeguards:

- daily key that expires, no stored mapping
- no IP address, user agent or account data sent to PostHog
- opt-out switch in Preferències (`garbuix_stats_off` cookie)
- Global Privacy Control and Do Not Track honoured as an objection, as GDPR
  art. 21(5) allows
- only today's and yesterday's puzzles counted, so no backfill of history

Outcome: the interest is not overridden by the players' interests or rights.

## AEPD consent exemption (LSSI art. 22.2)

The AEPD guide "Uso de cookies para herramientas de medición de audiencia"
(January 2024) exempts audience measurement from consent under the conditions
below. The guest cookie and the request that carries progress are "similar
technologies" in its terms, so the check applies.

| Condition in the guide | How Garbuix meets it |
| --- | --- |
| Purpose limited to measuring the audience of the site | Only start and finish counts per game and day. |
| Processing only on behalf of the publisher | Garbuix sends events to its own PostHog project. |
| Produces anonymous statistics only | Daily ids can't be linked across days or back to a player; output is daily totals. |
| No matching with other processing | The daily id is derived on the server and never stored next to the account or guest id. Events carry no account data. |
| No transfer to third parties | PostHog is a processor and receives no personal data. |
| No tracking across sites or apps | Ids are per day and per site. |
| Measurements within the guide's list | Per-page audience and user actions, aggregated daily. |
| Users informed, for example in the privacy policy | "Estadístiques d'ús" in `/privacitat`, linked from Preferències. |
| Identifier lifetime at most 13 months, never extended | Daily id: 1 day. Guest cookie: 395 days, set once when minted. |
| Data kept at most 25 months | Redis key: 48 hours. PostHog free plan: 1 year. The privacy policy promises 25 months at most. |
| Lifetime and retention reviewed periodically | This page, reviewed yearly. |
| Provider: art. 28 contract without reuse of the data | PostHog's DPA is signed. Since PostHog receives no personal data, reuse of personal data can't happen. |
| Provider: transfers outside the EU meet the GDPR | PostHog Cloud EU; DPF and SCCs in the DPA for anything processed in the US. |
| Documented assessment of the provider setup | This page, plus the PostHog project settings below. |

## PostHog project settings

- PostHog Cloud EU (`https://eu.i.posthog.com`), a project used only for these
  statistics.
- IP data capture: off.
- PostHog AI: off at organisation level.
- DPA: signed through the organisation settings.
- No browser SDK, session replay, surveys, feature flags or person profiles.

## What would break the exemption

Any of these needs consent, an update to this page and to the privacy policy:

- loading PostHog or any analytics script in the browser
- `identify()`, person profiles, or any link to the account or guest id
- an id that lasts longer than a day in PostHog
- sending IP addresses, user agents, referrers or campaign parameters
- session replay, heatmaps, surveys, feature flags or experiments
