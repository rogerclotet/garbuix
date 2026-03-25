import { describe, expect, it } from "vitest";
import {
	applyPuzzleEvent,
	applyPuzzleEventsChronologically,
	createEmptyProgressState,
	getCompatibleProgress,
	isSameProgressState,
	pickPreferredProgressState,
} from "@/lib/puzzle-progress";

describe("puzzle-progress", () => {
	it("deduplicates guesses and marks completion", () => {
		const initial = createEmptyProgressState({
			id: "puzzle-1",
			initialShuffledLetters: ["a", "b", "c"],
		});

		const once = applyPuzzleEvent(
			initial,
			{
				id: "1",
				at: "2026-03-10T10:00:00.000Z",
				type: "guess_added",
				payload: {
					guessHash: "guess-1",
					matchedWordId: 0,
					unlockToken: "unlock-1",
				},
			},
			1,
		);
		const duplicate = applyPuzzleEvent(
			once,
			{
				id: "2",
				at: "2026-03-10T10:01:00.000Z",
				type: "guess_added",
				payload: {
					guessHash: "guess-1",
					matchedWordId: 0,
					unlockToken: "unlock-1",
				},
			},
			1,
		);

		expect(once.guessCount).toBe(1);
		expect(once.guessedWordIds).toEqual([0]);
		expect(once.completedAt).toBe("2026-03-10T10:00:00.000Z");
		expect(duplicate).toEqual(once);
	});

	it("caps hints at three and resets progress", () => {
		let state = createEmptyProgressState({
			id: "puzzle-1",
			initialShuffledLetters: ["a", "b", "c"],
		});

		state = applyPuzzleEvent(
			state,
			{
				id: "shuffle",
				at: "2026-03-10T09:59:00.000Z",
				type: "letters_shuffled",
				payload: {
					shuffledLetters: ["c", "a", "b"],
				},
			},
			4,
		);

		expect(state.shuffledLetters).toEqual(["c", "a", "b"]);

		for (const cellKey of ["0,0", "0,1", "0,2", "0,3"]) {
			state = applyPuzzleEvent(
				state,
				{
					id: cellKey,
					at: "2026-03-10T10:00:00.000Z",
					type: "hint_used",
					payload: { cellKey },
				},
				4,
			);
		}

		expect(state.hintsUsed).toBe(3);
		expect(state.hintedCells).toEqual(["0,0", "0,1", "0,2"]);

		state = applyPuzzleEvent(
			state,
			{
				id: "reset",
				at: "2026-03-10T10:10:00.000Z",
				type: "progress_reset",
				payload: {},
			},
			4,
		);

		expect(state.guessCount).toBe(0);
		expect(state.guessedWordIds).toEqual([]);
		expect(state.hintedCells).toEqual([]);
		expect(state.completedAt).toBeNull();
	});

	it("replays out-of-order events chronologically", () => {
		const initial = createEmptyProgressState({
			id: "puzzle-1",
			initialShuffledLetters: ["a", "b", "c"],
		});

		const state = applyPuzzleEventsChronologically(
			initial,
			[
				{
					id: "guess-after-reset",
					at: "2026-03-10T10:12:00.000Z",
					type: "guess_added",
					payload: {
						guessHash: "guess-2",
						matchedWordId: 1,
						unlockToken: "unlock-2",
					},
				},
				{
					id: "older-reset",
					at: "2026-03-10T10:10:00.000Z",
					type: "progress_reset",
					payload: {},
				},
				{
					id: "guess-before-online-guess",
					at: "2026-03-10T10:11:00.000Z",
					type: "guess_added",
					payload: {
						guessHash: "guess-1",
						matchedWordId: 0,
						unlockToken: "unlock-1",
					},
				},
			],
			3,
		);

		expect(state.guessCount).toBe(2);
		expect(state.guessedWordIds).toEqual([0, 1]);
	});

	it("rejects progress from a different puzzle snapshot", () => {
		const progress = createEmptyProgressState({
			id: "puzzle-1",
			initialShuffledLetters: ["a", "b", "c"],
		});

		expect(getCompatibleProgress(progress, { id: "puzzle-1" })).toEqual(
			progress,
		);
		expect(getCompatibleProgress(progress, { id: "puzzle-2" })).toBeNull();
	});

	it("prefers the more recent progress snapshot", () => {
		const older = {
			...createEmptyProgressState({
				id: "puzzle-1",
				initialShuffledLetters: ["a", "b", "c"],
			}),
			guessHashes: ["guess-1"],
			guessedWordIds: [0],
			guessCount: 1,
			lastSyncedAt: "2026-03-10T10:00:00.000Z",
		};
		const newer = {
			...older,
			guessHashes: ["guess-1", "guess-2"],
			guessedWordIds: [0, 1],
			guessCount: 2,
			lastSyncedAt: "2026-03-10T10:05:00.000Z",
		};

		expect(pickPreferredProgressState(older, newer)).toEqual(newer);
		expect(pickPreferredProgressState(newer, older)).toEqual(newer);
	});

	it("falls back to richer progress when timestamps are missing", () => {
		const sparse = createEmptyProgressState({
			id: "puzzle-1",
			initialShuffledLetters: ["a", "b", "c"],
		});
		const richer = {
			...sparse,
			guessHashes: ["guess-1", "guess-2"],
			guessedWordIds: [0],
			guessCount: 2,
		};

		expect(pickPreferredProgressState(sparse, richer)).toEqual(richer);
	});

	it("compares progress without treating lastSyncedAt as state", () => {
		const left = {
			...createEmptyProgressState({
				id: "puzzle-1",
				initialShuffledLetters: ["a", "b", "c"],
			}),
			guessHashes: ["guess-1"],
			guessedWordIds: [0],
			guessCount: 1,
			lastSyncedAt: "2026-03-10T10:00:00.000Z",
		};
		const right = {
			...left,
			lastSyncedAt: "2026-03-10T10:05:00.000Z",
		};

		expect(isSameProgressState(left, right)).toBe(true);
	});
});
