import { describe, expect, it } from "vitest";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";

describe("puzzle-snapshot", () => {
	it("keeps answers and grid letters out of the public snapshot", async () => {
		const { privateSnapshot, publicSnapshot } = await buildPuzzleSnapshots({
			puzzleId: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			algorithmVersion: "1",
			letters: ["c", "a", "s"],
			initialShuffledLetters: ["a", "c", "s"],
			crossword: {
				rows: 1,
				cols: 3,
				grid: [
					[
						{ letter: "c", wordIds: [0] },
						{ letter: "a", wordIds: [0] },
						{ letter: "s", wordIds: [0] },
					],
				],
				words: [
					{
						id: 0,
						startRow: 0,
						startCol: 0,
						direction: "horizontal",
						revealed: false,
						word: {
							name: "cas",
							areatematica: "general",
							frequency: 1,
						},
					},
				],
			},
		});

		expect(publicSnapshot).not.toHaveProperty("gridLetters");
		expect(publicSnapshot.wordSlots[0]).not.toHaveProperty("displayWord");
		expect(publicSnapshot.wordSlots[0]).not.toHaveProperty("normalizedWord");
		expect(publicSnapshot.gridMask[0][0]).toEqual({ wordIds: [0] });
		expect(JSON.stringify(publicSnapshot)).not.toContain("cas");

		expect(privateSnapshot.gridLetters[0]).toEqual(["c", "a", "s"]);
		expect(privateSnapshot.wordSlots[0].displayWord).toBe("cas");
	});
});
