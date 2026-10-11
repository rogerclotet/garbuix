import { buildPuzzleHeadline } from "../../src/lib/puzzle-number.ts";

const MADRID_TIME_ZONE = "Europe/Madrid";
// Long enough for one submit; a failed run frees the day for another attempt
// once it expires.
const LOCK_SECONDS = 10 * 60;
// Only today's marker is ever read; old ones just need to clear out eventually.
const POSTED_MARKER_SECONDS = 30 * 24 * 60 * 60;
// The post the bot last pinned, so the next day's post can take its place.
const PINNED_KEY = "daily-post:pinned";

export type PostOutcome =
	| { status: "already-posted"; dateKey: string }
	| { status: "in-progress"; dateKey: string }
	| { status: "posted"; dateKey: string; postId: string };

export type DailyPostDeps = {
	now: () => Date;
	store: {
		get: (key: string) => Promise<string | undefined>;
		set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
		// Returns true only for the caller that created the key.
		acquire: (key: string, ttlSeconds: number) => Promise<boolean>;
	};
	submitPost: (title: string) => Promise<string>;
	pinPost: (postId: string) => Promise<void>;
	unpinPost: (postId: string) => Promise<void>;
};

export function getMadridDateKey(date: Date): string {
	// en-CA formats as YYYY-MM-DD, the same shape as the server's date keys.
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: MADRID_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export function postedKey(dateKey: string): string {
	return `daily-post:posted:${dateKey}`;
}

function lockKey(dateKey: string): string {
	return `daily-post:lock:${dateKey}`;
}

// Keeps only the newest daily post pinned. Checked on every run, so a pin that
// failed right after posting is retried a minute later.
async function ensurePinned(deps: DailyPostDeps, postId: string) {
	const pinnedId = await deps.store.get(PINNED_KEY);
	if (pinnedId === postId) return;

	if (pinnedId) {
		try {
			await deps.unpinPost(pinnedId);
		} catch (error) {
			// A moderator may have deleted or unpinned it already. Failing here would
			// keep today's post from ever being pinned.
			console.warn(`Could not unpin previous daily post ${pinnedId}:`, error);
		}
	}

	await deps.pinPost(postId);
	await deps.store.set(PINNED_KEY, postId);
}

// Runs every minute; posts at most once per Madrid day, in the first run after
// midnight. The bot can't ask garbuix.app whether the puzzle is ready, so it
// goes by the clock: the server generates each puzzle an hour before its day.
export async function postDailyPuzzle(
	deps: DailyPostDeps,
): Promise<PostOutcome> {
	const dateKey = getMadridDateKey(deps.now());

	const postedId = await deps.store.get(postedKey(dateKey));
	if (postedId) {
		await ensurePinned(deps, postedId);
		return { status: "already-posted", dateKey };
	}

	if (!(await deps.store.acquire(lockKey(dateKey), LOCK_SECONDS))) {
		return { status: "in-progress", dateKey };
	}

	const postId = await deps.submitPost(buildPuzzleHeadline(dateKey));
	await deps.store.set(postedKey(dateKey), postId, POSTED_MARKER_SECONDS);
	await ensurePinned(deps, postId);

	return { status: "posted", dateKey, postId };
}
