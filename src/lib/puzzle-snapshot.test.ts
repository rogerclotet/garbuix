import { describe, expect, it } from "vitest";
import {
	buildPuzzleSnapshots,
	ensureHintCapsulesCoverGrid,
} from "@/lib/puzzle-snapshot";

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

	it("creates hint capsules for every filled cell", async () => {
		const { publicSnapshot } = await buildPuzzleSnapshots({
			puzzleId: "puzzle-2",
			dateKey: "2026-03-11",
			seed: 456,
			algorithmVersion: "1",
			letters: ["a", "b", "c", "d", "e", "f"],
			initialShuffledLetters: ["f", "e", "d", "c", "b", "a"],
			crossword: {
				rows: 1,
				cols: 13,
				grid: [
					Array.from("abcdefghijklm").map((letter) => ({
						letter,
						wordIds: [0],
					})),
				],
				words: [
					{
						id: 0,
						startRow: 0,
						startCol: 0,
						direction: "horizontal",
						revealed: false,
						word: {
							name: "abcdefghijklm",
							areatematica: "general",
							frequency: 1,
						},
					},
				],
			},
		});

		expect(publicSnapshot.hintCapsules).toHaveLength(13);
		expect(
			new Set(publicSnapshot.hintCapsules.map((capsule) => capsule.cellKey))
				.size,
		).toBe(13);
	});

	it("fills missing hint capsules for older snapshots", async () => {
		const hintCapsules = await ensureHintCapsulesCoverGrid({
			puzzleId: "puzzle-3",
			seed: 789,
			gridLetters: [["c", "a", "s"]],
			existingHintCapsules: [
				{
					cellKey: "0,1",
					hintSalt: "legacy-salt",
					hintCapsule: "legacy-capsule",
				},
			],
		});

		expect(hintCapsules).toHaveLength(3);
		expect(hintCapsules.find((capsule) => capsule.cellKey === "0,1")).toEqual({
			cellKey: "0,1",
			hintSalt: "legacy-salt",
			hintCapsule: "legacy-capsule",
		});
		expect(new Set(hintCapsules.map((capsule) => capsule.cellKey))).toEqual(
			new Set(["0,0", "0,1", "0,2"]),
		);
	});
});
