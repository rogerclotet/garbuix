import { beforeEach, describe, expect, it, vi } from "vitest";
import type { dailyPuzzles } from "@/db/schema";

const { findFirst, insert, generateClues } = vi.hoisted(() => ({
	findFirst: vi.fn(),
	insert: vi.fn(),
	generateClues: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
	db: { query: { dailyPuzzles: { findFirst } }, insert },
}));
vi.mock("@/lib/clue-generator.server", () => ({
	generateAndStoreCluesForPuzzle: generateClues,
}));
vi.mock("@/lib/observability-server", () => ({
	captureServerEvent: vi.fn(),
	captureServerException: vi.fn(),
}));
vi.mock("@/lib/crossword-generator", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/crossword-generator")>()),
	generateDailyCrosswordForSeed: () => ({
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
	}),
}));

import { ensureDailyPuzzleSnapshot } from "@/lib/puzzle-generation.server";

beforeEach(() => {
	vi.clearAllMocks();
	findFirst.mockResolvedValue(undefined);
	insert.mockImplementation(() => ({
		values: (row: typeof dailyPuzzles.$inferInsert) => ({
			onConflictDoNothing: () => ({
				returning: async () => [row],
			}),
		}),
	}));
});

describe("puzzle generation clue lifecycle", () => {
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
