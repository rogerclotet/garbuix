import { describe, expect, it } from "vitest";
import { createUnlockToken } from "@/lib/puzzle-crypto";
import {
	collectAckedEventIds,
	filterSyncablePuzzleEvents,
} from "@/lib/puzzle-sync";

describe("puzzle-sync", () => {
	it("filters duplicate, existing, and invalid sync events", async () => {
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

		const filtered = await filterSyncablePuzzleEvents({
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

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.id).toBe("event-1");
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
