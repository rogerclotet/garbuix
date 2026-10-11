import { describe, expect, it } from "vitest";
import { measurePuzzleCard, type PuzzleCardInput } from "@/lib/puzzle-card";

function card(overrides: Partial<PuzzleCardInput> = {}): PuzzleCardInput {
	return {
		rows: 3,
		cols: 2,
		gridMask: [
			[{}, null],
			[{}, {}],
			[{}, null],
		],
		letters: ["a", "b", "c", "d", "e", "f"],
		revealedCells: new Set(),
		dateKey: "2026-03-11",
		detail: "2 paraules",
		stats: [],
		...overrides,
	};
}

describe("measurePuzzleCard", () => {
	it("keeps narrow boards wide enough for the header", () => {
		const narrow = measurePuzzleCard(card());
		const wide = measurePuzzleCard(
			card({ cols: 12, gridMask: [Array(12).fill({}), [], []] }),
		);

		expect(narrow.width).toBe(488);
		expect(wide.width).toBe(12 * 52 - 4 + 48);
	});

	it("adds room for the letters below the board", () => {
		const withLetters = measurePuzzleCard(card());
		const withoutLetters = measurePuzzleCard(card({ letters: [] }));

		expect(withLetters.height).toBeGreaterThan(withoutLetters.height);
	});

	it("adds room for stats only when there are any", () => {
		const plain = measurePuzzleCard(card());
		const withStats = measurePuzzleCard(
			card({ stats: [{ value: "12", label: "Intents" }] }),
		);

		expect(withStats.height).toBeGreaterThan(plain.height);
		expect(withStats.width).toBe(plain.width);
	});
});
