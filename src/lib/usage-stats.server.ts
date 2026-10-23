import { createHmac, randomBytes } from "node:crypto";
import { type EventMessage, PostHog } from "posthog-node";
import { readCookie } from "@/lib/cookies.server";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { getRedis } from "@/lib/redis.server";
import { getServerEnv } from "@/lib/server-env";
import {
	registerResourceCloser,
	trackBackgroundTask,
} from "@/lib/shutdown.server";
import { USAGE_STATS_OFF_COOKIE } from "@/lib/usage-stats";
import type { GameMode } from "@/lib/use-rendered-route";

// Counts who starts and who finishes each game's puzzle per day, for totals in
// PostHog. The privacy policy (routes/privacitat.tsx, "Estadístiques d'ús")
// promises what this module does, so a change here needs a change there.
//
// PostHog never learns who played. A player's id for the day is an HMAC of
// their account or guest id under a random key for that puzzle date. The key
// lives only in Redis and expires two days after it is made, and nothing records
// which id belongs to whom, so ids can't be linked across days or back to a
// player. Events carry the game, the puzzle date and that id. No IP address and
// no user agent: the server sends them, not the browser.

const DAY_KEY_TTL_SECONDS = 60 * 60 * 48;
const DAY_KEY_BYTES = 32;

export type UsagePlayer = { kind: "user" | "guest"; id: string };

export type PuzzleUsage = {
	game: GameMode;
	dateKey: string;
	player: UsagePlayer;
	started: boolean;
	completed: boolean;
};

export type UsageEventName = "puzzle_started" | "puzzle_completed";

// The subset of the Redis client this module uses.
export type UsageStatsStore = {
	set(
		key: string,
		value: string,
		expiryMode: "EX",
		seconds: number,
		setMode: "NX",
	): Promise<"OK" | null>;
	get(key: string): Promise<string | null>;
};

// Global Privacy Control and Do Not Track count as an objection, as GDPR art.
// 21(5) allows. Browsers send both on every request.
export function isUsageStatsRefused(headers: Headers): boolean {
	return (
		headers.get("sec-gpc") === "1" ||
		headers.get("dnt") === "1" ||
		readCookie(headers, USAGE_STATS_OFF_COOKIE) === "1"
	);
}

// Today's puzzle, or yesterday's for a player who finished before midnight and
// synced after it. Any older date's key has expired or is about to.
export function isCountableDateKey(dateKey: string): boolean {
	return dateKey === getTodayDateKey() || dateKey === getYesterdayDateKey();
}

export function usageEventsFor(
	usage: Pick<PuzzleUsage, "started" | "completed">,
): UsageEventName[] {
	if (usage.completed) return ["puzzle_started", "puzzle_completed"];
	return usage.started ? ["puzzle_started"] : [];
}

export function dailyPlayerId(dayKey: string, player: UsagePlayer): string {
	return createHmac("sha256", dayKey)
		.update(`${player.kind}:${player.id}`)
		.digest("base64url");
}

export function buildUsageEvent(
	event: UsageEventName,
	distinctId: string,
	usage: Pick<PuzzleUsage, "game" | "dateKey">,
): EventMessage {
	return {
		distinctId,
		event,
		properties: {
			game: usage.game,
			puzzle_date: usage.dateKey,
			$process_person_profile: false,
		},
		disableGeoip: true,
	};
}

async function getDayKey(
	store: UsageStatsStore,
	dateKey: string,
): Promise<string> {
	const redisKey = `stats:key:${dateKey}`;
	// NX keeps the first key made for the date, so every app instance (and the
	// previous release during a deploy) derives the same ids.
	await store.set(
		redisKey,
		randomBytes(DAY_KEY_BYTES).toString("base64url"),
		"EX",
		DAY_KEY_TTL_SECONDS,
		"NX",
	);
	const dayKey = await store.get(redisKey);
	if (!dayKey) {
		throw new Error(`Usage stats day key for ${dateKey} vanished after SET NX`);
	}
	return dayKey;
}

// Players report progress after every guess, so most calls repeat an event the
// day already has. The marker holds only the derived id, never the player's.
async function claimEvent(
	store: UsageStatsStore,
	event: UsageEventName,
	distinctId: string,
	usage: Pick<PuzzleUsage, "game" | "dateKey">,
): Promise<boolean> {
	const claimed = await store.set(
		`stats:seen:${usage.dateKey}:${usage.game}:${event}:${distinctId}`,
		"1",
		"EX",
		DAY_KEY_TTL_SECONDS,
		"NX",
	);
	return claimed === "OK";
}

export async function sendPuzzleUsage(
	usage: PuzzleUsage,
	deps: {
		store: UsageStatsStore;
		capture: (message: EventMessage) => void;
	},
): Promise<void> {
	const events = usageEventsFor(usage);
	if (events.length === 0) return;

	const distinctId = dailyPlayerId(
		await getDayKey(deps.store, usage.dateKey),
		usage.player,
	);
	for (const event of events) {
		if (await claimEvent(deps.store, event, distinctId, usage)) {
			deps.capture(buildUsageEvent(event, distinctId, usage));
		}
	}
}

let cachedPostHog: PostHog | null | undefined;

function getPostHog(): PostHog | null {
	if (cachedPostHog !== undefined) return cachedPostHog;

	const { POSTHOG_PROJECT_KEY, POSTHOG_HOST } = getServerEnv();
	// Worktrees copy the same .env, so local play would land in the real totals.
	if (!POSTHOG_PROJECT_KEY || process.env.NODE_ENV !== "production") {
		cachedPostHog = null;
		return null;
	}

	const client = new PostHog(POSTHOG_PROJECT_KEY, {
		host: POSTHOG_HOST,
		disableGeoip: true,
		personProfiles: "never",
		enableExceptionAutocapture: false,
	});
	// Runs after background work finishes, so queued events are flushed.
	registerResourceCloser(() => client.shutdown());
	cachedPostHog = client;
	return client;
}

// Called with the progress a request just saved or reported. Returns at once;
// the counting runs in the background so it never slows down play.
export function recordPuzzleUsage(
	requestHeaders: Headers,
	usage: PuzzleUsage,
): void {
	if (isUsageStatsRefused(requestHeaders)) return;
	if (!isCountableDateKey(usage.dateKey)) return;

	// Like the leaderboard, statistics need Redis and do nothing without it.
	const posthog = getPostHog();
	const store = posthog ? getRedis() : null;
	if (!posthog || !store) return;

	trackBackgroundTask(
		sendPuzzleUsage(usage, {
			store,
			capture: (message) => posthog.capture(message),
		}).catch((error: unknown) => {
			// A missed event only undercounts the day; play is unaffected.
			console.warn("[usage-stats] recording failed", error);
		}),
	);
}

// Signed-in players are counted from the progress their sync just saved.
export function recordSyncedProgressUsage(
	requestHeaders: Headers,
	sync: {
		game: GameMode;
		dateKey: string;
		userId: string;
		progress: Pick<PuzzleProgressState, "guessCount" | "completedAt">;
	},
): void {
	recordPuzzleUsage(requestHeaders, {
		game: sync.game,
		dateKey: sync.dateKey,
		player: { kind: "user", id: sync.userId },
		started: sync.progress.guessCount > 0,
		completed: sync.progress.completedAt !== null,
	});
}
