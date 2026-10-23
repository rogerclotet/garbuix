import { createHmac, randomBytes } from "node:crypto";
import { type EventMessage, PostHog } from "posthog-node";
import { readAnonDeviceId } from "@/lib/anon-session.server";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { getRedis } from "@/lib/redis.server";
import { getServerEnv } from "@/lib/server-env";
import {
	registerResourceCloser,
	trackBackgroundTask,
} from "@/lib/shutdown.server";
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
//
// A guest who signs in stays one player for the day: the account takes over the
// guest's daily id (see linkGuestOnSignIn), just as it takes over their
// progress. The link is between two derived ids and expires with the day.

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

function activeKey(dateKey: string, distinctId: string): string {
	return `stats:active:${dateKey}:${distinctId}`;
}

function aliasKey(dateKey: string, accountDailyId: string): string {
	return `stats:alias:${dateKey}:${accountDailyId}`;
}

function guestClaimKey(dateKey: string, guestDailyId: string): string {
	return `stats:claimed:${dateKey}:${guestDailyId}`;
}

// The id the day's events go out under: the account's own, unless it took over
// a guest's id on sign-in.
async function resolveDistinctId(
	store: UsageStatsStore,
	dayKey: string,
	usage: Pick<PuzzleUsage, "dateKey" | "player">,
): Promise<string> {
	const ownId = dailyPlayerId(dayKey, usage.player);
	if (usage.player.kind !== "user") return ownId;
	return (await store.get(aliasKey(usage.dateKey, ownId))) ?? ownId;
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

	const dayKey = await getDayKey(deps.store, usage.dateKey);
	const distinctId = await resolveDistinctId(deps.store, dayKey, usage);
	for (const event of events) {
		if (await claimEvent(deps.store, event, distinctId, usage)) {
			// Lets a sign-in later today find that this id already played.
			await deps.store.set(
				activeKey(usage.dateKey, distinctId),
				"1",
				"EX",
				DAY_KEY_TTL_SECONDS,
				"NX",
			);
			deps.capture(buildUsageEvent(event, distinctId, usage));
		}
	}
}

// Hands a guest's daily id to the account they signed in to, so the progress
// that moves to the account doesn't count them a second time. Returns whether
// it linked them.
export async function linkGuestToAccount(
	store: UsageStatsStore,
	link: { guestId: string; userId: string; dateKey: string },
): Promise<boolean> {
	// Without a key nobody has played that date, so there is nothing to merge.
	const dayKey = await store.get(`stats:key:${link.dateKey}`);
	if (!dayKey) return false;

	const guestDailyId = dailyPlayerId(dayKey, {
		kind: "guest",
		id: link.guestId,
	});
	const accountDailyId = dailyPlayerId(dayKey, {
		kind: "user",
		id: link.userId,
	});
	if (!(await store.get(activeKey(link.dateKey, guestDailyId)))) return false;
	// An account already counted today, on another device, keeps its own id:
	// switching now would split its events across two ids.
	if (await store.get(activeKey(link.dateKey, accountDailyId))) return false;

	// One account per guest id, so two people signing in on a shared device
	// stay two players.
	const claimed = await store.set(
		guestClaimKey(link.dateKey, guestDailyId),
		accountDailyId,
		"EX",
		DAY_KEY_TTL_SECONDS,
		"NX",
	);
	if (
		claimed !== "OK" &&
		(await store.get(guestClaimKey(link.dateKey, guestDailyId))) !==
			accountDailyId
	) {
		return false;
	}

	await store.set(
		aliasKey(link.dateKey, accountDailyId),
		guestDailyId,
		"EX",
		DAY_KEY_TTL_SECONDS,
		"NX",
	);
	return true;
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
export function recordPuzzleUsage(usage: PuzzleUsage): void {
	if (!isCountableDateKey(usage.dateKey)) return;

	// Like the leaderboard, statistics need Redis and do nothing without it, and
	// they do nothing in tests or development (see getPostHog).
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
export function recordSyncedProgressUsage(sync: {
	game: GameMode;
	dateKey: string;
	userId: string;
	progress: Pick<PuzzleProgressState, "guessCount" | "completedAt">;
}): void {
	recordPuzzleUsage({
		game: sync.game,
		dateKey: sync.dateKey,
		player: { kind: "user", id: sync.userId },
		started: sync.progress.guessCount > 0,
		completed: sync.progress.completedAt !== null,
	});
}

// Runs as a session is created, while the request still carries the guest
// cookie. Awaited, so the account's first sync already finds the link.
export async function linkGuestOnSignIn(
	userId: string,
	requestHeaders: Headers | undefined,
): Promise<void> {
	if (!requestHeaders) return;
	const guestId = readAnonDeviceId(
		new Request("http://localhost", { headers: requestHeaders }),
	);
	if (!guestId) return;

	const posthog = getPostHog();
	const store = posthog ? getRedis() : null;
	if (!posthog || !store) return;

	try {
		for (const dateKey of [getTodayDateKey(), getYesterdayDateKey()]) {
			await linkGuestToAccount(store, { guestId, userId, dateKey });
		}
	} catch (error) {
		// Signing in must not fail over statistics; the day may count them twice.
		console.warn("[usage-stats] linking a guest on sign-in failed", error);
	}
}
