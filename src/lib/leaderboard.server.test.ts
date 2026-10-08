import { describe, expect, it } from "vitest";
import { boundAnonProgress } from "@/lib/leaderboard.server";

describe("boundAnonProgress", () => {
	it("caps words at the board's real size", () => {
		expect(
			boundAnonProgress(
				{ wordsFound: 200, tryCount: 200, completedAt: null },
				12,
			),
		).toEqual({ wordsFound: 12, tryCount: 200, completedAt: null });
	});

	it("never reports fewer tries than words found", () => {
		expect(
			boundAnonProgress({ wordsFound: 12, tryCount: 1, completedAt: null }, 12)
				.tryCount,
		).toBe(12);
	});

	it("keeps completion only when every word is found", () => {
		const completedAt = "2026-10-08T10:00:00.000Z";
		expect(
			boundAnonProgress({ wordsFound: 11, tryCount: 20, completedAt }, 12)
				.completedAt,
		).toBeNull();
		expect(
			boundAnonProgress({ wordsFound: 12, tryCount: 20, completedAt }, 12)
				.completedAt,
		).toBe(completedAt);
	});

	it("passes honest progress through unchanged", () => {
		const claim = { wordsFound: 5, tryCount: 9, completedAt: null };
		expect(boundAnonProgress(claim, 12)).toEqual(claim);
	});
});
