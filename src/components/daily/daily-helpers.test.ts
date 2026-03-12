import { describe, expect, it } from "vitest";
import { getGuessKeyboardAction } from "./daily-helpers";

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
