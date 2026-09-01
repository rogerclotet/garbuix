import { describe, expect, it } from "vitest";
import {
	anonymousImportPayloadSchema,
	puzzleClientEventsSchema,
} from "@/lib/puzzle-event-schemas";

const guessEvent = {
	id: "3f1c2b7a-0000-4000-8000-000000000001",
	at: "2026-09-01T10:00:00.000Z",
	type: "guess_added" as const,
	payload: {
		guessHash: "a".repeat(64),
		matchedWordId: 3,
		unlockToken: "b".repeat(64),
	},
};

describe("puzzleClientEventsSchema", () => {
	it("accepts each event the client produces", () => {
		const events = [
			guessEvent,
			{
				id: "e2",
				at: "2026-09-01T10:00:01.000Z",
				type: "hint_used",
				payload: { cellKey: "3,4" },
			},
			{
				id: "e3",
				at: "2026-09-01T10:00:02.000Z",
				type: "text_hint_requested",
				payload: { wordId: 2 },
			},
			{
				id: "e4",
				at: "2026-09-01T10:00:03.000Z",
				type: "text_hint_fallback",
				payload: { wordId: 2, cellKey: "1,1" },
			},
			{
				id: "e5",
				at: "2026-09-01T10:00:04.000Z",
				type: "bonus_clue_revealed",
				payload: { cellKey: "0,0" },
			},
			{
				id: "e6",
				at: "2026-09-01T10:00:05.000Z",
				type: "letters_shuffled",
				payload: { shuffledLetters: ["a", "b", "c"] },
			},
			{
				id: "e7",
				at: "2026-09-01T10:00:06.000Z",
				type: "progress_reset",
				payload: {},
			},
		];

		expect(puzzleClientEventsSchema.safeParse(events).success).toBe(true);
	});

	it("rejects an unknown event type", () => {
		const result = puzzleClientEventsSchema.safeParse([
			{
				id: "e1",
				at: "2026-09-01T10:00:00.000Z",
				type: "drop_table",
				payload: {},
			},
		]);

		expect(result.success).toBe(false);
	});

	it("rejects an event whose payload doesn't match its type", () => {
		const result = puzzleClientEventsSchema.safeParse([
			{ ...guessEvent, payload: { cellKey: "1,1" } },
		]);

		expect(result.success).toBe(false);
	});

	it("strips unknown payload fields instead of persisting them", () => {
		const result = puzzleClientEventsSchema.parse([
			{
				...guessEvent,
				payload: { ...guessEvent.payload, injected: "should not be stored" },
			},
		]);

		expect(result[0].payload).not.toHaveProperty("injected");
	});

	it("caps how many events one sync can carry", () => {
		const events = Array.from({ length: 501 }, (_, index) => ({
			...guessEvent,
			id: `event-${index}`,
		}));

		expect(puzzleClientEventsSchema.safeParse(events).success).toBe(false);
	});

	it("rejects out-of-range word ids and oversized hashes", () => {
		expect(
			puzzleClientEventsSchema.safeParse([
				{
					...guessEvent,
					payload: { ...guessEvent.payload, matchedWordId: -1 },
				},
			]).success,
		).toBe(false);

		expect(
			puzzleClientEventsSchema.safeParse([
				{
					...guessEvent,
					payload: { ...guessEvent.payload, guessHash: "x".repeat(500) },
				},
			]).success,
		).toBe(false);
	});
});

describe("anonymousImportPayloadSchema", () => {
	const entry = {
		dateKey: "2026-08-31",
		seed: 260831,
		totalWords: 6,
		guessedWords: 6,
		guessCount: 12,
		hintsUsed: 1,
		completed: true,
		lastUpdated: "2026-08-31T21:00:00.000Z",
	};

	it("accepts a well-formed import", () => {
		const result = anonymousImportPayloadSchema.safeParse({
			historyEntries: [entry],
			activeProgressByDate: {},
		});

		expect(result.success).toBe(true);
	});

	it("rejects a malformed date key", () => {
		const result = anonymousImportPayloadSchema.safeParse({
			historyEntries: [{ ...entry, dateKey: "31/08/2026" }],
			activeProgressByDate: {},
		});

		expect(result.success).toBe(false);
	});

	it("rejects a payload that isn't the expected shape at all", () => {
		expect(anonymousImportPayloadSchema.safeParse("nope").success).toBe(false);
		expect(anonymousImportPayloadSchema.safeParse({}).success).toBe(false);
	});
});
