import { describe, expect, it } from "vitest";
import { getGuessKeyboardAction, getNextHintCellKey } from "./daily-helpers";

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
