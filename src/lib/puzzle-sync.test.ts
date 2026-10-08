import { describe, expect, it } from "vitest";
import { createGuessHash, createUnlockToken } from "@/lib/puzzle-crypto";
import { getSlotHintCellKey } from "@/lib/puzzle-helpers";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import {
	buildPuzzleSnapshots,
	toPlayedPublicSnapshot,
} from "@/lib/puzzle-snapshot";
import {
	collectAckedEventIds,
	countDerivedBonusClues,
	filterSyncablePuzzleEvents,
	hasLeaderboardScoreDelta,
	sanitizeProgressState,
} from "@/lib/puzzle-sync";
import type { PuzzleClientEvent } from "@/lib/puzzle-types";

describe("puzzle-sync", () => {
	it("deduplicates events and sanitizes invalid matched guesses", async () => {
		const slotSalt = "slot-1";
		const unlockToken = await createUnlockToken(slotSalt, "cas");
		const publicSnapshot = {
			id: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			algorithmVersion: "1",
			rows: 1,
			cols: 3,
			gridMask: [[{ wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }]],
			letters: ["c", "a", "s"],
			initialShuffledLetters: ["a", "c", "s"],
			validNormalizedGuesses: ["cas"],
			wordSlots: [
				{
					id: 0,
					startRow: 0,
					startCol: 0,
					direction: "horizontal" as const,
					length: 3,
					slotSalt,
					answerHash: "hash",
					answerCapsule: "capsule",
				},
			],
			hintCapsules: [],
		};
		const privateSnapshot = {
			id: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			rows: 1,
			cols: 3,
			gridLetters: [["c", "a", "s"]],
			letters: ["c", "a", "s"],
			wordSlots: [
				{
					id: 0,
					displayWord: "cas",
					normalizedWord: "cas",
					startRow: 0,
					startCol: 0,
					direction: "horizontal" as const,
				},
			],
		};

		const result = await filterSyncablePuzzleEvents({
			existingEventIds: new Set(["already-synced"]),
			publicSnapshot,
			privateSnapshot,
			bonusGuessHashes: new Set(),
			events: [
				{
					id: "already-synced",
					at: "2026-03-10T10:00:00.000Z",
					type: "guess_added",
					payload: {
						guessHash: "guess-1",
						matchedWordId: 0,
						unlockToken,
					},
				},
				{
					id: "event-1",
					at: "2026-03-10T10:01:00.000Z",
					type: "guess_added",
					payload: {
						guessHash: "guess-2",
						matchedWordId: 0,
						unlockToken,
					},
				},
				{
					id: "event-1",
					at: "2026-03-10T10:02:00.000Z",
					type: "guess_added",
					payload: {
						guessHash: "guess-2",
						matchedWordId: 0,
						unlockToken,
					},
				},
				{
					id: "event-2",
					at: "2026-03-10T10:03:00.000Z",
					type: "guess_added",
					payload: {
						guessHash: "guess-3",
						matchedWordId: 0,
						unlockToken: "bad-token",
					},
				},
			],
		});

		expect(result.diagnostics.acceptedCount).toBe(2);
		expect(result.diagnostics.existingOnServerCount).toBe(1);
		expect(result.diagnostics.duplicateInPayloadCount).toBe(1);
		expect(result.diagnostics.sanitizedInvalidUnlockTokenCount).toBe(1);
		const filtered = result.filteredEvents;
		expect(filtered).toHaveLength(2);
		expect(filtered[0]?.id).toBe("event-1");
		expect(filtered[1]).toEqual({
			id: "event-2",
			at: "2026-03-10T10:03:00.000Z",
			type: "guess_added",
			payload: {
				guessHash: "guess-3",
				matchedWordId: null,
				unlockToken: null,
			},
		});
	});

	it("rejects hint events with invalid cells, unknown words, or over budget", async () => {
		const publicSnapshot = {
			id: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			algorithmVersion: "1",
			rows: 1,
			cols: 3,
			gridMask: [[{ wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }]],
			letters: ["c", "a", "s"],
			initialShuffledLetters: ["a", "c", "s"],
			validNormalizedGuesses: ["cas"],
			wordSlots: [
				{
					id: 0,
					startRow: 0,
					startCol: 0,
					direction: "horizontal" as const,
					length: 3,
					slotSalt: "slot-1",
					answerHash: "hash",
					answerCapsule: "capsule",
				},
			],
			hintCapsules: [],
		};
		const privateSnapshot = {
			id: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			rows: 1,
			cols: 3,
			gridLetters: [["c", "a", "s"]],
			letters: ["c", "a", "s"],
			wordSlots: [
				{
					id: 0,
					displayWord: "cas",
					normalizedWord: "cas",
					startRow: 0,
					startCol: 0,
					direction: "horizontal" as const,
				},
			],
		};

		const result = await filterSyncablePuzzleEvents({
			existingEventIds: new Set(),
			publicSnapshot,
			privateSnapshot,
			bonusGuessHashes: new Set(),
			existingHintState: {
				hintsUsed: 3,
				hintedCells: [],
				clueWordIds: [],
				guessHashes: [],
				bonusWordsFound: 4,
			},
			events: [
				{
					id: "hint-over-budget",
					at: "2026-03-10T10:00:00.000Z",
					type: "hint_used",
					payload: { cellKey: "0,0" },
				},
				{
					id: "hint-bad-cell",
					at: "2026-03-10T10:01:00.000Z",
					type: "hint_used",
					payload: { cellKey: "9,9" },
				},
				{
					id: "text-hint-bad-word",
					at: "2026-03-10T10:02:00.000Z",
					type: "text_hint_requested",
					payload: { wordId: 99 },
				},
				{
					id: "fallback-without-request",
					at: "2026-03-10T10:03:00.000Z",
					type: "text_hint_fallback",
					payload: { wordId: 0, cellKey: "0,0" },
				},
				{
					id: "bonus-not-earned",
					at: "2026-03-10T10:04:00.000Z",
					type: "bonus_clue_revealed",
					payload: { cellKey: "0,1" },
				},
			],
		});

		expect(result.filteredEvents).toHaveLength(0);
		expect(result.diagnostics.sanitizedInvalidHintCount).toBe(5);
		expect(result.rejectedEventIds).toEqual([
			"hint-over-budget",
			"hint-bad-cell",
			"text-hint-bad-word",
			"fallback-without-request",
			"bonus-not-earned",
		]);
	});

	it("accepts a valid hint sequence", async () => {
		const publicSnapshot = {
			id: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			algorithmVersion: "1",
			rows: 1,
			cols: 3,
			gridMask: [[{ wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }]],
			letters: ["c", "a", "s"],
			initialShuffledLetters: ["a", "c", "s"],
			validNormalizedGuesses: ["cas"],
			wordSlots: [
				{
					id: 0,
					startRow: 0,
					startCol: 0,
					direction: "horizontal" as const,
					length: 3,
					slotSalt: "slot-1",
					answerHash: "hash",
					answerCapsule: "capsule",
				},
			],
			hintCapsules: [],
		};
		const privateSnapshot = {
			id: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			rows: 1,
			cols: 3,
			gridLetters: [["c", "a", "s"]],
			letters: ["c", "a", "s"],
			wordSlots: [
				{
					id: 0,
					displayWord: "cas",
					normalizedWord: "cas",
					startRow: 0,
					startCol: 0,
					direction: "horizontal" as const,
				},
			],
		};

		const result = await filterSyncablePuzzleEvents({
			existingEventIds: new Set(),
			publicSnapshot,
			privateSnapshot,
			bonusGuessHashes: new Set(),
			existingHintState: {
				hintsUsed: 0,
				hintedCells: [],
				clueWordIds: [],
				guessHashes: [],
				bonusWordsFound: 5,
			},
			events: [
				{
					id: "text-hint",
					at: "2026-03-10T10:00:00.000Z",
					type: "text_hint_requested",
					payload: { wordId: 0 },
				},
				{
					id: "text-fallback",
					at: "2026-03-10T10:01:00.000Z",
					type: "text_hint_fallback",
					payload: { wordId: 0, cellKey: "0,1" },
				},
				{
					id: "bonus-hint",
					at: "2026-03-10T10:02:00.000Z",
					type: "bonus_clue_revealed",
					payload: { cellKey: "0,2" },
				},
			],
		});

		expect(result.filteredEvents).toHaveLength(3);
		expect(result.diagnostics.sanitizedInvalidHintCount).toBe(0);
	});

	it("acks stored, accepted and rejected events", () => {
		const ackedEventIds = collectAckedEventIds({
			existingEventIds: new Set(["existing-1", "existing-2"]),
			rejectedEventIds: ["rejected-1"],
			filteredEvents: [
				{
					id: "new-1",
					at: "2026-03-10T10:01:00.000Z",
					type: "letters_shuffled",
					payload: {
						shuffledLetters: ["a", "b", "c"],
					},
				},
				{
					id: "existing-2",
					at: "2026-03-10T10:02:00.000Z",
					type: "hint_used",
					payload: {
						cellKey: "0,0",
					},
				},
			],
		});

		expect(ackedEventIds).toEqual([
			"existing-1",
			"existing-2",
			"new-1",
			"rejected-1",
		]);
	});
});

describe("bonus clue validation", () => {
	const publicSnapshot = {
		id: "puzzle-1",
		dateKey: "2026-03-10",
		seed: 123,
		algorithmVersion: "1",
		rows: 1,
		cols: 3,
		gridMask: [[{ wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }]],
		letters: ["c", "a", "s"],
		initialShuffledLetters: ["a", "c", "s"],
		validNormalizedGuesses: ["cas"],
		wordSlots: [
			{
				id: 0,
				startRow: 0,
				startCol: 0,
				direction: "horizontal" as const,
				length: 3,
				slotSalt: "slot-1",
				answerHash: "hash",
				answerCapsule: "capsule",
			},
		],
		hintCapsules: [],
	};
	const privateSnapshot = {
		id: "puzzle-1",
		dateKey: "2026-03-10",
		seed: 123,
		rows: 1,
		cols: 3,
		gridLetters: [["c", "a", "s"]],
		letters: ["c", "a", "s"],
		wordSlots: [
			{
				id: 0,
				displayWord: "cas",
				normalizedWord: "cas",
				startRow: 0,
				startCol: 0,
				direction: "horizontal" as const,
			},
		],
	};
	const bonusGuessHashes = new Set(["bonus-1", "bonus-2", "bonus-3"]);

	function bonusGuess(id: string, guessHash: string): PuzzleClientEvent {
		return {
			id,
			at: "2026-03-10T10:00:00.000Z",
			type: "guess_added",
			payload: {
				guessHash,
				matchedWordId: null,
				unlockToken: null,
				validNotInPuzzle: true,
			},
		};
	}

	function bonusReveal(id: string, cellKey: string): PuzzleClientEvent {
		return {
			id,
			at: "2026-03-10T10:01:00.000Z",
			type: "bonus_clue_revealed",
			payload: { cellKey },
		};
	}

	function existingState(bonusWordsFound: number, guessHashes: string[] = []) {
		return {
			hintsUsed: 0,
			hintedCells: [],
			clueWordIds: [],
			guessHashes,
			bonusWordsFound,
		};
	}

	it("strips the bonus claim from a guess that isn't a valid extra word", async () => {
		const result = await filterSyncablePuzzleEvents({
			existingEventIds: new Set(),
			publicSnapshot,
			privateSnapshot,
			bonusGuessHashes,
			events: [bonusGuess("fake", "made-up")],
		});

		expect(result.diagnostics.sanitizedInvalidBonusWordCount).toBe(1);
		expect(result.filteredEvents[0]).toMatchObject({
			payload: { guessHash: "made-up", validNotInPuzzle: false },
		});
	});

	it("accepts a reveal earned by words found earlier in the same batch", async () => {
		const result = await filterSyncablePuzzleEvents({
			existingEventIds: new Set(),
			publicSnapshot,
			privateSnapshot,
			bonusGuessHashes,
			existingHintState: existingState(4),
			events: [bonusGuess("fifth", "bonus-1"), bonusReveal("reveal", "0,0")],
		});

		expect(result.filteredEvents.map((event) => event.id)).toEqual([
			"fifth",
			"reveal",
		]);
	});

	it("does not count a repeated guess toward a reveal", async () => {
		const result = await filterSyncablePuzzleEvents({
			existingEventIds: new Set(),
			publicSnapshot,
			privateSnapshot,
			bonusGuessHashes,
			existingHintState: existingState(4, ["bonus-1"]),
			events: [bonusGuess("repeat", "bonus-1"), bonusReveal("reveal", "0,0")],
		});

		expect(result.filteredEvents.map((event) => event.id)).toEqual(["repeat"]);
		expect(result.diagnostics.sanitizedInvalidHintCount).toBe(1);
	});

	it("allows one reveal per five bonus words, counting stored reveals", async () => {
		const result = await filterSyncablePuzzleEvents({
			existingEventIds: new Set(),
			publicSnapshot,
			privateSnapshot,
			bonusGuessHashes,
			existingHintState: existingState(10),
			existingBonusCluesRevealed: 1,
			events: [bonusReveal("second", "0,0"), bonusReveal("third", "0,1")],
		});

		expect(result.filteredEvents.map((event) => event.id)).toEqual(["second"]);
		expect(result.diagnostics.sanitizedInvalidHintCount).toBe(1);
	});
});

describe("hasLeaderboardScoreDelta", () => {
	const state = {
		wordsFound: 3,
		hintsUsed: 1,
		guessCount: 12,
		completed: false,
	};

	it("republishes a guess that matched nothing", () => {
		expect(hasLeaderboardScoreDelta(state, { ...state, guessCount: 13 })).toBe(
			true,
		);
	});

	it("republishes new words, clues and the finish", () => {
		expect(hasLeaderboardScoreDelta(state, { ...state, wordsFound: 4 })).toBe(
			true,
		);
		expect(hasLeaderboardScoreDelta(state, { ...state, hintsUsed: 2 })).toBe(
			true,
		);
		expect(hasLeaderboardScoreDelta(state, { ...state, completed: true })).toBe(
			true,
		);
	});

	it("republishes counts that went down", () => {
		expect(
			hasLeaderboardScoreDelta(state, {
				wordsFound: 0,
				hintsUsed: 0,
				guessCount: 0,
				completed: false,
			}),
		).toBe(true);
	});

	it("stays quiet when nothing the score reads has moved", () => {
		expect(hasLeaderboardScoreDelta(state, { ...state })).toBe(false);
	});
});

describe("sanitizeProgressState", () => {
	const puzzleId = "puzzle-import";
	const words = ["casa", "sacs", "casc"];

	async function buildFixture() {
		const { publicSnapshot, privateSnapshot } = await buildPuzzleSnapshots({
			puzzleId,
			dateKey: "2026-03-10",
			seed: 123,
			algorithmVersion: "test",
			letters: ["c", "a", "s"],
			initialShuffledLetters: ["s", "a", "c"],
			availableWordCount: 3,
			crossword: {
				rows: 3,
				cols: 4,
				grid: words.map((word, id) =>
					[...word].map((letter) => ({ letter, wordIds: [id] })),
				),
				words: words.map((name, id) => ({
					id,
					word: { name, areatematica: "test", frequency: 1000 },
					startRow: id,
					startCol: 0,
					direction: "horizontal" as const,
					revealed: false,
				})),
			},
		});
		const playedSnapshot = await toPlayedPublicSnapshot({
			publicSnapshot,
			privateSnapshot,
		});
		const bonusGuessHashes = new Set(
			await Promise.all(
				["saca", "caca", "casca", "cassa", "assa"].map((word) =>
					createGuessHash(puzzleId, word),
				),
			),
		);
		const fallbackCell = (wordId: number) => {
			const slot = playedSnapshot.wordSlots[wordId];
			const cellKey = slot ? getSlotHintCellKey(playedSnapshot, slot) : null;
			if (!cellKey) throw new Error("fixture word has no hint cell");
			return cellKey;
		};
		return {
			playedSnapshot,
			privateSnapshot,
			bonusGuessHashes,
			fallbackCell,
			empty: createEmptyProgressState(playedSnapshot),
		};
	}

	it("keeps only found words with a valid unlock token", async () => {
		const fixture = await buildFixture();
		const slot = fixture.playedSnapshot.wordSlots[0];
		if (!slot) throw new Error("missing slot");
		const realToken = await createUnlockToken(slot.slotSalt, "casa");

		const sanitized = await sanitizeProgressState({
			...fixture,
			progress: {
				...fixture.empty,
				guessedWordIds: [0, 1, 2],
				revealedWordTokens: { "0": realToken, "1": "forged", "2": "forged" },
				completedAt: "2026-03-10T12:00:00.000Z",
			},
		});

		expect(sanitized.guessedWordIds).toEqual([0]);
		expect(sanitized.revealedWordTokens).toEqual({ "0": realToken });
		expect(sanitized.guessHashes).toEqual([
			await createGuessHash(puzzleId, "casa"),
		]);
		expect(sanitized.guessCount).toBe(1);
		expect(sanitized.completedAt).toBeNull();
	});

	it("counts only real extra words toward bonus clues", async () => {
		const fixture = await buildFixture();
		const sanitized = await sanitizeProgressState({
			...fixture,
			progress: {
				...fixture.empty,
				guessHashes: [
					await createGuessHash(puzzleId, "saca"),
					await createGuessHash(puzzleId, "caca"),
					"made-up",
				],
				bonusWordsFound: 999,
			},
		});

		expect(sanitized.bonusWordsFound).toBe(2);
	});

	it("keeps clues within budget and charges every clue word", async () => {
		const fixture = await buildFixture();
		const sanitized = await sanitizeProgressState({
			...fixture,
			progress: { ...fixture.empty, clueWordIds: [0, 1, 99], hintsUsed: 0 },
		});

		expect(sanitized.clueWordIds).toEqual([0, 1]);
		expect(sanitized.hintsUsed).toBe(2);
	});

	it("drops revealed letters nothing can explain", async () => {
		const fixture = await buildFixture();
		const sanitized = await sanitizeProgressState({
			...fixture,
			progress: {
				...fixture.empty,
				clueWordIds: [0],
				hintsUsed: 1,
				hintedCells: [fixture.fallbackCell(0), "1,0", "2,0", "9,9"],
			},
		});

		expect(sanitized.hintedCells).toEqual([fixture.fallbackCell(0)]);
	});

	it("keeps a bonus letter once five extra words earn it", async () => {
		const fixture = await buildFixture();
		const guessHashes = await Promise.all(
			["saca", "caca", "casca", "cassa", "assa"].map((word) =>
				createGuessHash(puzzleId, word),
			),
		);
		const sanitized = await sanitizeProgressState({
			...fixture,
			progress: {
				...fixture.empty,
				guessHashes,
				bonusWordsFound: 5,
				hintedCells: ["1,0", "2,0"],
			},
		});

		expect(sanitized.hintedCells).toEqual(["1,0"]);
	});

	it("derives bonus reveals from letters no clue explains", async () => {
		const fixture = await buildFixture();
		expect(
			countDerivedBonusClues(
				{
					clueWordIds: [0],
					hintsUsed: 1,
					hintedCells: [fixture.fallbackCell(0), "1,0", "2,0"],
				},
				fixture.playedSnapshot,
			),
		).toBe(2);
		// A legacy letter hint explains one of them.
		expect(
			countDerivedBonusClues(
				{
					clueWordIds: [0],
					hintsUsed: 2,
					hintedCells: [fixture.fallbackCell(0), "1,0", "2,0"],
				},
				fixture.playedSnapshot,
			),
		).toBe(1);
	});
});
