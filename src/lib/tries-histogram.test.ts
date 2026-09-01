import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "@/lib/leaderboard-types";
import {
	buildTriesHistogram,
	TRIES_HISTOGRAM_OPEN_BUCKET_START,
	triesBucketIndex,
} from "@/lib/tries-histogram";

function buildEntry(
	participantId: string,
	tryCount: number,
	completed = true,
): LeaderboardEntry {
	return {
		participantId,
		kind: "user",
		name: participantId,
		image: null,
		wordsFound: completed ? 15 : 7,
		totalWords: 15,
		clueCount: 0,
		tryCount,
		completedAt: completed ? "2026-04-11T10:00:00.000Z" : null,
		updatedAt: "2026-04-11T10:00:00.000Z",
	};
}

describe("tries-histogram", () => {
	it("groups tries in tens starting at fifteen", () => {
		expect(triesBucketIndex(15)).toBe(0);
		expect(triesBucketIndex(24)).toBe(0);
		expect(triesBucketIndex(25)).toBe(1);
		expect(triesBucketIndex(34)).toBe(1);
		expect(triesBucketIndex(35)).toBe(2);
	});

	it("labels the buckets by their range and leaves the last one open-ended", () => {
		const { buckets } = buildTriesHistogram([]);
		expect(buckets[0]?.label).toBe("15-24");
		expect(buckets[1]?.label).toBe("25-34");
		expect(buckets.at(-1)?.label).toBe(`${TRIES_HISTOGRAM_OPEN_BUCKET_START}+`);
		expect(buckets.at(-1)?.end).toBeNull();
	});

	it("counts only the players who finished", () => {
		const histogram = buildTriesHistogram([
			buildEntry("a", 17),
			buildEntry("b", 21),
			buildEntry("c", 26),
			buildEntry("d", 30, false),
		]);

		expect(histogram.totalFinishers).toBe(3);
		expect(histogram.buckets[0]?.count).toBe(2);
		expect(histogram.buckets[1]?.count).toBe(1);
		expect(histogram.maxCount).toBe(2);
	});

	it("folds everything above the open bucket into it", () => {
		const histogram = buildTriesHistogram([
			buildEntry("a", TRIES_HISTOGRAM_OPEN_BUCKET_START),
			buildEntry("b", 400),
		]);

		expect(histogram.buckets.at(-1)?.count).toBe(2);
		expect(histogram.maxCount).toBe(2);
	});

	it("keeps impossibly low try counts in the first bucket", () => {
		const histogram = buildTriesHistogram([buildEntry("a", 3)]);
		expect(histogram.buckets[0]?.count).toBe(1);
	});

	it("counts the local player until their own entry reaches the stream", () => {
		const histogram = buildTriesHistogram([buildEntry("other", 18)], {
			highlightTries: 26,
			selfParticipantId: "me",
		});

		expect(histogram.totalFinishers).toBe(2);
		expect(histogram.buckets[1]?.count).toBe(1);
	});

	it("stops counting the local player once their entry arrives", () => {
		const histogram = buildTriesHistogram(
			[buildEntry("other", 18), buildEntry("me", 26)],
			{ highlightTries: 26, selfParticipantId: "me" },
		);

		expect(histogram.totalFinishers).toBe(2);
		expect(histogram.buckets[1]?.count).toBe(1);
	});

	it("points the highlight at the local player's bucket", () => {
		expect(
			buildTriesHistogram([buildEntry("a", 17)], { highlightTries: 41 })
				.highlightIndex,
		).toBe(2);
		expect(
			buildTriesHistogram([buildEntry("a", 17)]).highlightIndex,
		).toBeNull();
		expect(
			buildTriesHistogram([buildEntry("a", 17)], { highlightTries: null })
				.highlightIndex,
		).toBeNull();
	});
});
