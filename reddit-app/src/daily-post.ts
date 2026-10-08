import { buildPuzzleHeadline } from "../../src/lib/puzzle-number.ts";

export const GARBUIX_ORIGIN = "https://garbuix.app";

const MADRID_TIME_ZONE = "Europe/Madrid";
// Long enough for one fetch, upload and submit; a failed run frees the day for
// another attempt once it expires.
const LOCK_SECONDS = 10 * 60;
// Only today's marker is ever read; old ones just need to clear out eventually.
const POSTED_MARKER_SECONDS = 30 * 24 * 60 * 60;
// The post the bot last pinned, so the next day's post can take its place.
const PINNED_KEY = "daily-post:pinned";

export type DailyPost = {
	dateKey: string;
	title: string;
	imagePath: string;
};

// What goes up for the day. imagePath is null when garbuix.app couldn't be
// reached and the post is the title alone.
type PostContent = {
	title: string;
	imagePath: string | null;
};

export type PostOutcome =
	| { status: "already-posted"; dateKey: string }
	| { status: "not-ready"; dateKey: string }
	| { status: "in-progress"; dateKey: string }
	| { status: "posted"; dateKey: string; postId: string; withImage: boolean };

export type DailyPostDeps = {
	now: () => Date;
	fetch: (url: string) => Promise<Response>;
	store: {
		get: (key: string) => Promise<string | undefined>;
		set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
		// Returns true only for the caller that created the key.
		acquire: (key: string, ttlSeconds: number) => Promise<boolean>;
	};
	uploadImage: (dataUrl: string) => Promise<string>;
	submitPost: (title: string, imageUrl: string) => Promise<string>;
	submitTextPost: (title: string) => Promise<string>;
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

function isDailyPost(value: unknown): value is DailyPost {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.dateKey === "string" &&
		typeof record.title === "string" &&
		typeof record.imagePath === "string" &&
		record.imagePath.startsWith("/")
	);
}

// null while the server is still on the previous day or today's puzzle is not
// generated yet; the next scheduled run tries again.
async function fetchDailyPost(
	deps: DailyPostDeps,
	today: string,
): Promise<DailyPost | null> {
	const response = await deps.fetch(`${GARBUIX_ORIGIN}/api/daily-post`);
	if (response.status === 503) return null;
	if (!response.ok) {
		throw new Error(`GET /api/daily-post failed with HTTP ${response.status}`);
	}

	const body: unknown = await response.json();
	if (!isDailyPost(body)) {
		throw new Error(
			`GET /api/daily-post returned an unexpected body: ${JSON.stringify(body)}`,
		);
	}
	return body.dateKey === today ? body : null;
}

// Devvit uploads media from a URL or a data URL. Passing the bytes keeps all
// outbound traffic on the allow-listed domain.
async function fetchImageDataUrl(
	deps: DailyPostDeps,
	imagePath: string,
): Promise<string> {
	const response = await deps.fetch(`${GARBUIX_ORIGIN}${imagePath}`);
	if (!response.ok) {
		throw new Error(`GET ${imagePath} failed with HTTP ${response.status}`);
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	return `data:image/png;base64,${bytes.toString("base64")}`;
}

// The day still gets its thread when garbuix.app is down or the fetch domain is
// not approved: the title only needs the date. An answer of "not ready yet"
// still waits for the next run.
async function getPostContent(
	deps: DailyPostDeps,
	dateKey: string,
): Promise<PostContent | null> {
	try {
		return await fetchDailyPost(deps, dateKey);
	} catch (error) {
		console.warn("Could not get today's post from garbuix.app:", error);
		return { title: buildPuzzleHeadline(dateKey), imagePath: null };
	}
}

async function submitImagePost(
	deps: DailyPostDeps,
	title: string,
	imagePath: string,
): Promise<string> {
	const dataUrl = await fetchImageDataUrl(deps, imagePath);
	const imageUrl = await deps.uploadImage(dataUrl);
	return deps.submitPost(title, imageUrl);
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
// garbuix.app has rolled over to the new puzzle or turns out to be unreachable.
export async function postDailyPuzzle(
	deps: DailyPostDeps,
): Promise<PostOutcome> {
	const dateKey = getMadridDateKey(deps.now());

	const postedId = await deps.store.get(postedKey(dateKey));
	if (postedId) {
		await ensurePinned(deps, postedId);
		return { status: "already-posted", dateKey };
	}

	const content = await getPostContent(deps, dateKey);
	if (!content) {
		return { status: "not-ready", dateKey };
	}

	if (!(await deps.store.acquire(lockKey(dateKey), LOCK_SECONDS))) {
		return { status: "in-progress", dateKey };
	}

	const postId =
		content.imagePath === null
			? await deps.submitTextPost(content.title)
			: await submitImagePost(deps, content.title, content.imagePath);
	await deps.store.set(postedKey(dateKey), postId, POSTED_MARKER_SECONDS);
	await ensurePinned(deps, postId);

	return {
		status: "posted",
		dateKey,
		postId,
		withImage: content.imagePath !== null,
	};
}
