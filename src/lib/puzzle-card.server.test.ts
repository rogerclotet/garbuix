import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/puzzle-generation.server", () => ({
	readDailyPuzzleRow: vi.fn(),
}));

import { measurePuzzleCard, type PuzzleCardInput } from "@/lib/puzzle-card";
import { renderPuzzleCardPng } from "@/lib/puzzle-card.server";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

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

function pngSize(png: Buffer): { width: number; height: number } {
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("renderPuzzleCardPng", () => {
	it("renders a PNG at twice the card's measured size", () => {
		const input = card();
		const png = renderPuzzleCardPng(input);
		const measured = measurePuzzleCard(input);

		expect([...png.subarray(0, 4)]).toEqual(PNG_SIGNATURE);
		expect(pngSize(png)).toEqual({
			width: measured.width * 2,
			height: measured.height * 2,
		});
	});

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
