import { describe, expect, it } from "vitest";
import {
	buildPuzzleSnapshots,
	ensureHintCapsulesCoverGrid,
	hydratePublicSnapshotWordMetadata,
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

	it("rejects duplicate normalized answers in the same puzzle", async () => {
		await expect(
			buildPuzzleSnapshots({
				puzzleId: "puzzle-4",
				dateKey: "2026-04-01",
				seed: 260401,
				algorithmVersion: "1",
				letters: ["c", "o", "n", "s", "l"],
				initialShuffledLetters: ["l", "s", "n", "o", "c"],
				crossword: {
					rows: 2,
					cols: 6,
					grid: [
						Array.from("consol").map((letter) => ({
							letter,
							wordIds: [0],
						})),
						Array.from("cònsol").map((letter) => ({
							letter,
							wordIds: [1],
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
								name: "consol",
								areatematica: "Nom",
								frequency: 1,
							},
						},
						{
							id: 1,
							startRow: 1,
							startCol: 0,
							direction: "horizontal",
							revealed: false,
							word: {
								name: "cònsol",
								areatematica: "Nom",
								frequency: 1,
							},
						},
					],
				},
			}),
		).rejects.toThrow(/Duplicate normalized answer "consol"/);
	});

	it("stores middot metadata without counting the dot as a playable letter", async () => {
		const { privateSnapshot, publicSnapshot } = await buildPuzzleSnapshots({
			puzzleId: "puzzle-5",
			dateKey: "2026-04-02",
			seed: 260402,
			algorithmVersion: "1",
			letters: ["c", "o", "l", "a", "b", "r"],
			initialShuffledLetters: ["r", "b", "a", "l", "o", "c"],
			crossword: {
				rows: 1,
				cols: 10,
				grid: [
					Array.from("collaborar").map((letter) => ({
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
							name: "col·laborar",
							areatematica: "Verb",
							frequency: 1,
						},
					},
				],
			},
		});

		expect(publicSnapshot.wordSlots[0]).toMatchObject({
			length: 10,
			middleDotAfterIndices: [2],
		});
		expect(privateSnapshot.wordSlots[0]?.displayWord).toBe("col·laborar");
		expect(privateSnapshot.gridLetters[0]).toEqual(Array.from("collaborar"));
	});

	it("backfills middot metadata for older public snapshots from the private snapshot", () => {
		const upgradedSnapshot = hydratePublicSnapshotWordMetadata({
			publicSnapshot: {
				id: "puzzle-6",
				dateKey: "2026-04-03",
				seed: 260403,
				algorithmVersion: "2",
				rows: 1,
				cols: 10,
				gridMask: [
					Array.from({ length: 10 }, () => ({
						wordIds: [0],
					})),
				],
				letters: ["c", "o", "l", "a", "b", "r"],
				initialShuffledLetters: ["c", "o", "l", "a", "b", "r"],
				validNormalizedGuesses: [],
				wordSlots: [
					{
						id: 0,
						startRow: 0,
						startCol: 0,
						direction: "horizontal",
						length: 11,
						slotSalt: "slot-0",
						answerHash: "hash-0",
						answerCapsule: "capsule-0",
					},
				],
				hintCapsules: [],
			},
			privateSnapshot: {
				id: "puzzle-6",
				dateKey: "2026-04-03",
				seed: 260403,
				rows: 1,
				cols: 10,
				gridLetters: [Array.from("collaborar")],
				letters: ["c", "o", "l", "a", "b", "r"],
				wordSlots: [
					{
						id: 0,
						displayWord: "col·laborar",
						normalizedWord: "collaborar",
						startRow: 0,
						startCol: 0,
						direction: "horizontal",
					},
				],
			},
		});

		expect(upgradedSnapshot.wordSlots[0]).toMatchObject({
			length: 10,
			middleDotAfterIndices: [2],
		});
	});
});
