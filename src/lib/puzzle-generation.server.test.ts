import * as Sentry from "@sentry/tanstackstart-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { dailyPuzzles } from "@/db/schema";

const { findFirst, findMany, insert, generateClues, generateCrossword } =
	vi.hoisted(() => ({
		findFirst: vi.fn(),
		findMany: vi.fn(),
		insert: vi.fn(),
		generateClues: vi.fn().mockResolvedValue(undefined),
		generateCrossword: vi.fn(),
	}));

vi.mock("@/lib/db", () => ({
	db: { query: { dailyPuzzles: { findFirst, findMany } }, insert },
}));
vi.mock("@/lib/clue-generator.server", () => ({
	generateAndStoreCluesForPuzzle: generateClues,
}));
vi.mock("@/lib/crossword-generator", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/crossword-generator")>()),
	generateDailyCrosswordForSeed: generateCrossword,
}));

const generatedCrossword = {
	letters: ["c", "a", "s"],
	shuffledLetters: ["s", "a", "c"],
	crossword: {
		rows: 1,
		cols: 3,
		grid: [[..."cas"].map((letter) => ({ letter, wordIds: [0] }))],
		words: [
			{
				id: 0,
				startRow: 0,
				startCol: 0,
				direction: "horizontal",
				revealed: false,
				word: { name: "cas", areatematica: "general", frequency: 4000 },
			},
		],
	},
};

import { ensureDailyPuzzleSnapshot } from "@/lib/puzzle-generation.server";

beforeEach(() => {
	vi.clearAllMocks();
	findFirst.mockResolvedValue(undefined);
	findMany.mockResolvedValue([]);
	generateCrossword.mockReturnValue(generatedCrossword);
	insert.mockImplementation(() => ({
		values: (row: typeof dailyPuzzles.$inferInsert) => ({
			onConflictDoNothing: () => ({
				returning: async () => [row],
			}),
		}),
	}));
});

describe("puzzle generation history", () => {
	it("generates against the puzzles stored for the days before", async () => {
		findMany.mockResolvedValue([
			{
				dateKey: "2026-03-09",
				privateSnapshotJson: {
					letters: ["t", "a", "u", "l", "e", "r"],
					wordSlots: [
						{ normalizedWord: "taula" },
						{ normalizedWord: "ratera" },
					],
				},
			},
			{
				dateKey: "2026-02-27",
				privateSnapshotJson: {
					letters: ["c", "a", "s", "o", "n", "e"],
					wordSlots: [{ normalizedWord: "cases" }],
				},
			},
		]);

		await ensureDailyPuzzleSnapshot("2026-03-12", { generateClues: false });

		expect(generateCrossword.mock.lastCall?.[4]).toEqual({
			recentHistory: [
				{
					daysAgo: 3,
					letters: ["t", "a", "u", "l", "e", "r"],
					letterSetKey: "aelrtu",
					selectedWordKeys: ["taula", "ratera"],
				},
				{
					daysAgo: 13,
					letters: ["c", "a", "s", "o", "n", "e"],
					letterSetKey: "acenos",
					selectedWordKeys: ["cases"],
				},
			],
		});
	});

	it("generates without history when no earlier puzzle is stored", async () => {
		await ensureDailyPuzzleSnapshot("2026-03-12", { generateClues: false });

		expect(generateCrossword.mock.lastCall?.[4]).toEqual({ recentHistory: [] });
	});
});

describe("puzzle generation clue lifecycle", () => {
	it("reports background clue failures that cannot reach request middleware", async () => {
		const events: Sentry.ErrorEvent[] = [];
		const client = Sentry.init({
			dsn: "https://public@example.com/1",
			defaultIntegrations: false,
			beforeSend(event) {
				events.push(event);
				return null;
			},
		});
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		generateClues.mockRejectedValueOnce(new Error("background clues failed"));
		try {
			await ensureDailyPuzzleSnapshot("2026-03-12");
			await vi.waitFor(() => expect(log).toHaveBeenCalled());
			await Sentry.flush();
			expect(events).toHaveLength(1);
			expect(events[0]?.exception?.values?.[0]?.value).toBe(
				"background clues failed",
			);
		} finally {
			log.mockRestore();
			await client?.close();
		}
	});
	it("lets one-shot backfills persist a puzzle without starting background clues", async () => {
		const puzzle = await ensureDailyPuzzleSnapshot("2026-03-10", {
			generateClues: false,
		});

		expect(puzzle.dateKey).toBe("2026-03-10");
		expect(puzzle.privateSnapshotJson.wordSlots).toHaveLength(1);
		expect(insert).toHaveBeenCalledOnce();
		expect(generateClues).not.toHaveBeenCalled();
	});

	it("keeps background clues enabled by default without awaiting the AI request", async () => {
		let finishClues = () => {};
		const pendingClues = new Promise<void>((resolve) => {
			finishClues = resolve;
		});
		generateClues.mockReturnValueOnce(pendingClues);
		try {
			const puzzle = await ensureDailyPuzzleSnapshot("2026-03-11");

			expect(generateClues).toHaveBeenCalledExactlyOnceWith({
				puzzleId: puzzle.id,
				wordSlots: puzzle.privateSnapshotJson.wordSlots,
			});
		} finally {
			finishClues();
		}
	});
});
