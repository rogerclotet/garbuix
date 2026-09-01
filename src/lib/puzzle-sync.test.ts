import { describe, expect, it } from "vitest";
import { createUnlockToken } from "@/lib/puzzle-crypto";
import {
	collectAckedEventIds,
	filterSyncablePuzzleEvents,
	hasLeaderboardScoreDelta,
} from "@/lib/puzzle-sync";

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
			existingHintState: {
				hintsUsed: 3,
				hintedCells: [],
				clueWordIds: [],
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
			],
		});

		expect(result.filteredEvents).toHaveLength(0);
		expect(result.diagnostics.sanitizedInvalidHintCount).toBe(4);
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

	it("acks events that were already stored server-side", () => {
		const ackedEventIds = collectAckedEventIds({
			existingEventIds: new Set(["existing-1", "existing-2"]),
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

		expect(ackedEventIds).toEqual(["existing-1", "existing-2", "new-1"]);
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

	it("republishes a reset, which lowers the counts", () => {
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
