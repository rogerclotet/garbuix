import type { LeaderboardEntry } from "@/lib/leaderboard-types";

// A perfect run guesses each of the day's words on the first try, so nobody can
// finish with fewer tries than there are words. The buckets start there instead
// of at zero, and every bucket after the first spans ten tries.
export const TRIES_HISTOGRAM_MIN_TRIES = 15;
export const TRIES_HISTOGRAM_BUCKET_SIZE = 10;
// The last bucket is open-ended: a single 400-try player would otherwise stretch
// the axis until every real bucket is a sliver.
export const TRIES_HISTOGRAM_OPEN_BUCKET_START = 95;

export type TriesHistogramBucket = {
	start: number;
	// null on the open-ended last bucket.
	end: number | null;
	label: string;
	count: number;
};

export type TriesHistogram = {
	buckets: TriesHistogramBucket[];
	totalFinishers: number;
	maxCount: number;
	// Index of the bucket holding the local player's tries, or null when they
	// haven't finished (or no highlight was asked for).
	highlightIndex: number | null;
};

const BUCKET_COUNT =
	(TRIES_HISTOGRAM_OPEN_BUCKET_START - TRIES_HISTOGRAM_MIN_TRIES) /
		TRIES_HISTOGRAM_BUCKET_SIZE +
	1;

export function triesBucketIndex(tries: number): number {
	if (!Number.isFinite(tries)) {
		return 0;
	}
	// Tries below the theoretical minimum shouldn't happen, but a legacy import
	// or a future puzzle with fewer words would land there; keep them in view
	// rather than dropping them off the left edge.
	const clamped = Math.max(TRIES_HISTOGRAM_MIN_TRIES, Math.floor(tries));
	const index = Math.floor(
		(clamped - TRIES_HISTOGRAM_MIN_TRIES) / TRIES_HISTOGRAM_BUCKET_SIZE,
	);
	return Math.min(index, BUCKET_COUNT - 1);
}

function emptyBuckets(): TriesHistogramBucket[] {
	return Array.from({ length: BUCKET_COUNT }, (_, index) => {
		const start =
			TRIES_HISTOGRAM_MIN_TRIES + index * TRIES_HISTOGRAM_BUCKET_SIZE;
		const isOpen = index === BUCKET_COUNT - 1;
		const end = isOpen ? null : start + TRIES_HISTOGRAM_BUCKET_SIZE - 1;
		return {
			start,
			end,
			label: isOpen ? `${start}+` : `${start}-${end}`,
			count: 0,
		};
	});
}

// Only players who finished count: an unfinished board's try count says nothing
// about how many tries the puzzle takes.
function hasFinished(entry: LeaderboardEntry): boolean {
	return entry.completedAt != null;
}

export function buildTriesHistogram(
	entries: LeaderboardEntry[],
	options?: {
		// The local player's own try count, once they've finished.
		highlightTries?: number | null;
		// Who the local player is on the leaderboard. Their finish reaches the
		// stream a moment after the puzzle ends, so until their entry shows up
		// their result is counted here from the highlight: it is certain to
		// arrive, and a chart that leaves the player out of it reads as wrong.
		selfParticipantId?: string | null;
	},
): TriesHistogram {
	const buckets = emptyBuckets();
	let totalFinishers = 0;
	let selfCounted = false;

	for (const entry of entries) {
		if (!hasFinished(entry)) {
			continue;
		}
		totalFinishers += 1;
		if (entry.participantId === options?.selfParticipantId) {
			selfCounted = true;
		}
		const bucket = buckets[triesBucketIndex(entry.tryCount)];
		if (bucket) {
			bucket.count += 1;
		}
	}

	const highlightTries = options?.highlightTries;
	const hasHighlight =
		highlightTries != null && Number.isFinite(highlightTries);
	const highlightIndex = hasHighlight ? triesBucketIndex(highlightTries) : null;

	if (hasHighlight && !selfCounted && highlightIndex != null) {
		totalFinishers += 1;
		const bucket = buckets[highlightIndex];
		if (bucket) {
			bucket.count += 1;
		}
	}

	return {
		buckets,
		totalFinishers,
		maxCount: buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0),
		highlightIndex,
	};
}
