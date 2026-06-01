import { describe, expect, it } from "vitest";
import {
	buildCellLetters,
	getDisplayedSlotWord,
	getGuessKeyboardAction,
	getNextHintCellKey,
	getRandomHintCellKey,
	getSlotHintCellKey,
	getSortedWordSlots,
} from "./daily-helpers";

function buildHintPuzzle(hintCellKeys: string[]) {
	return {
		id: "puzzle-1",
		dateKey: "2026-03-10",
		seed: 123,
		algorithmVersion: "1",
		rows: 1,
		cols: hintCellKeys.length,
		gridMask: [],
		letters: [],
		initialShuffledLetters: [],
		validNormalizedGuesses: [],
		wordSlots: [],
		hintCapsules: hintCellKeys.map((cellKey, index) => ({
			cellKey,
			hintSalt: `salt-${index}`,
			hintCapsule: `capsule-${index}`,
		})),
	};
}

describe("getGuessKeyboardAction", () => {
	it("maps typed letters to the available puzzle letters", () => {
		expect(getGuessKeyboardAction("A", ["a", "m", "ç"])).toEqual({
			type: "append_letter",
			letter: "a",
		});
		expect(getGuessKeyboardAction("à", ["a", "m", "ç"])).toEqual({
			type: "append_letter",
			letter: "a",
		});
		expect(getGuessKeyboardAction("Ç", ["a", "m", "ç"])).toEqual({
			type: "append_letter",
			letter: "ç",
		});
	});

	it("rejects letters that are not available", () => {
		expect(getGuessKeyboardAction("x", ["a", "m", "ç"])).toBeNull();
		expect(getGuessKeyboardAction("c", ["a", "m", "ç"])).toBeNull();
		expect(getGuessKeyboardAction("ArrowLeft", ["a", "m", "ç"])).toBeNull();
	});

	it("supports submit and delete keys", () => {
		expect(getGuessKeyboardAction("Enter", ["a", "m", "ç"])).toEqual({
			type: "submit",
		});
		expect(getGuessKeyboardAction(" ", ["a", "m", "ç"])).toEqual({
			type: "submit",
		});
		expect(getGuessKeyboardAction("Space", ["a", "m", "ç"], "Space")).toEqual({
			type: "submit",
		});
		expect(getGuessKeyboardAction("Backspace", ["a", "m", "ç"])).toEqual({
			type: "backspace",
		});
		expect(getGuessKeyboardAction("Delete", ["a", "m", "ç"])).toEqual({
			type: "backspace",
		});
	});
});

describe("getNextHintCellKey", () => {
	it("returns the first hidden hint cell", () => {
		expect(
			getNextHintCellKey(
				{
					id: "puzzle-1",
					dateKey: "2026-03-10",
					seed: 123,
					algorithmVersion: "1",
					rows: 1,
					cols: 3,
					gridMask: [[{ wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }]],
					letters: ["a", "b", "c"],
					initialShuffledLetters: ["a", "b", "c"],
					validNormalizedGuesses: [],
					wordSlots: [],
					hintCapsules: [
						{ cellKey: "0,0", hintSalt: "salt-0", hintCapsule: "capsule-0" },
						{ cellKey: "0,1", hintSalt: "salt-1", hintCapsule: "capsule-1" },
					],
				},
				new Set(["0,0"]),
			),
		).toBe("0,1");
	});

	it("returns null when there are no hidden letters left", () => {
		expect(
			getNextHintCellKey(
				{
					id: "puzzle-1",
					dateKey: "2026-03-10",
					seed: 123,
					algorithmVersion: "1",
					rows: 1,
					cols: 2,
					gridMask: [[{ wordIds: [0] }, { wordIds: [0] }]],
					letters: ["a", "b"],
					initialShuffledLetters: ["a", "b"],
					validNormalizedGuesses: [],
					wordSlots: [],
					hintCapsules: [
						{ cellKey: "0,0", hintSalt: "salt-0", hintCapsule: "capsule-0" },
						{ cellKey: "0,1", hintSalt: "salt-1", hintCapsule: "capsule-1" },
					],
				},
				new Set(["0,0", "0,1"]),
			),
		).toBeNull();
	});
});

describe("getRandomHintCellKey", () => {
	it("only ever returns an unrevealed capsule cell", () => {
		const puzzle = buildHintPuzzle(["0,0", "0,1", "0,2", "0,3"]);
		const revealed = new Set(["0,0", "0,2"]);

		for (let attempt = 0; attempt < 50; attempt += 1) {
			const cellKey = getRandomHintCellKey(puzzle, revealed);
			expect(["0,1", "0,3"]).toContain(cellKey);
		}
	});

	it("returns null when every capsule cell is already revealed", () => {
		const puzzle = buildHintPuzzle(["0,0", "0,1"]);

		expect(getRandomHintCellKey(puzzle, new Set(["0,0", "0,1"]))).toBeNull();
		expect(getRandomHintCellKey(buildHintPuzzle([]), new Set())).toBeNull();
	});
});

describe("getSlotHintCellKey", () => {
	const horizontalSlot = {
		id: 0,
		startRow: 0,
		startCol: 0,
		direction: "horizontal" as const,
		length: 4,
		slotSalt: "salt-0",
		answerHash: "hash-0",
		answerCapsule: "capsule-0",
	};
	const verticalSlot = {
		id: 1,
		startRow: 0,
		startCol: 0,
		direction: "vertical" as const,
		length: 3,
		slotSalt: "salt-1",
		answerHash: "hash-1",
		answerCapsule: "capsule-1",
	};

	function buildPuzzle(
		wordSlots: Array<typeof horizontalSlot | typeof verticalSlot>,
		hintCellKeys: string[],
	) {
		return {
			id: "puzzle-1",
			dateKey: "2026-03-10",
			seed: 123,
			algorithmVersion: "1",
			rows: 3,
			cols: 4,
			gridMask: [],
			letters: [],
			initialShuffledLetters: [],
			validNormalizedGuesses: [],
			wordSlots,
			hintCapsules: hintCellKeys.map((cellKey, index) => ({
				cellKey,
				hintSalt: `salt-${index}`,
				hintCapsule: `capsule-${index}`,
			})),
		};
	}

	it("prefers a cell that no crossing word covers", () => {
		// (0,0) is shared with the vertical word and listed first, but the fallback
		// must skip it so the revealed letter isn't hidden behind a crossing reveal.
		const puzzle = buildPuzzle(
			[horizontalSlot, verticalSlot],
			["0,0", "0,1", "0,2", "0,3", "1,0", "2,0"],
		);

		expect(getSlotHintCellKey(puzzle, horizontalSlot)).toBe("0,1");
	});

	it("falls back to any slot capsule cell when every cell crosses", () => {
		// A two-cell word whose cells are both intersections has no owned cell.
		const shortHorizontal = { ...horizontalSlot, length: 2 };
		const crossingVertical = {
			...verticalSlot,
			startCol: 1,
		};
		const puzzle = buildPuzzle(
			[shortHorizontal, verticalSlot, crossingVertical],
			["0,0", "0,1"],
		);

		expect(getSlotHintCellKey(puzzle, shortHorizontal)).toBe("0,0");
	});

	it("returns null when the slot has no capsule cell", () => {
		const puzzle = buildPuzzle([horizontalSlot], ["2,3"]);

		expect(getSlotHintCellKey(puzzle, horizontalSlot)).toBeNull();
	});
});

describe("getSortedWordSlots", () => {
	it("puts the most revealed unfound words first and found words at the bottom", () => {
		const wordSlots = [
			{
				id: 0,
				startRow: 0,
				startCol: 0,
				direction: "horizontal" as const,
				length: 4,
				slotSalt: "salt-0",
				answerHash: "hash-0",
				answerCapsule: "capsule-0",
			},
			{
				id: 1,
				startRow: 1,
				startCol: 0,
				direction: "horizontal" as const,
				length: 3,
				slotSalt: "salt-1",
				answerHash: "hash-1",
				answerCapsule: "capsule-1",
			},
			{
				id: 2,
				startRow: 2,
				startCol: 0,
				direction: "horizontal" as const,
				length: 5,
				slotSalt: "salt-2",
				answerHash: "hash-2",
				answerCapsule: "capsule-2",
			},
			{
				id: 3,
				startRow: 3,
				startCol: 0,
				direction: "horizontal" as const,
				length: 6,
				slotSalt: "salt-3",
				answerHash: "hash-3",
				answerCapsule: "capsule-3",
			},
		];

		const cellLetters = new Map<string, string>([
			["0,0", "a"],
			["0,1", "b"],
			["2,0", "c"],
			["2,1", "d"],
			["2,2", "e"],
		]);

		const { notFoundSlots, foundSlots } = getSortedWordSlots(
			wordSlots,
			[1, 3],
			cellLetters,
		);

		expect(notFoundSlots.map((slot) => slot.id)).toEqual([2, 0]);
		expect(foundSlots.map((slot) => slot.id)).toEqual([3, 1]);
	});

	it("shows middots as free hints without adding extra playable cells", () => {
		const slot = {
			id: 0,
			startRow: 0,
			startCol: 0,
			direction: "horizontal" as const,
			length: 10,
			middleDotAfterIndices: [2],
			slotSalt: "slot-0",
			answerHash: "hash-0",
			answerCapsule: "capsule-0",
		};

		const cellLetters = buildCellLetters(
			[slot],
			{
				0: "col·laborar",
			},
			{},
		);

		expect(getDisplayedSlotWord(slot, new Map())).toBe("___·_______");
		expect(getDisplayedSlotWord(slot, cellLetters)).toBe("COL·LABORAR");
		expect(cellLetters.size).toBe(10);
		expect(cellLetters.get("0,2")).toBe("l");
		expect(cellLetters.get("0,3")).toBe("l");
		expect(cellLetters.has("0,10")).toBe(false);
	});

	it("preserves accents when revealed answers are shown on the grid", () => {
		const slot = {
			id: 0,
			startRow: 0,
			startCol: 0,
			direction: "horizontal" as const,
			length: 5,
			slotSalt: "slot-0",
			answerHash: "hash-0",
			answerCapsule: "capsule-0",
		};

		const cellLetters = buildCellLetters(
			[slot],
			{
				0: "camió",
			},
			{},
		);

		expect(getDisplayedSlotWord(slot, cellLetters)).toBe("CAMIÓ");
		expect(cellLetters.get("0,4")).toBe("ó");
	});
});
