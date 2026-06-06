import { describe, expect, it } from "vitest";
import { MAX_CLUE_LENGTH, validateClueText } from "@/lib/clue-fairness";

describe("clue-fairness", () => {
	it("accepts a legitimate clue", () => {
		expect(validateClueText("Creix al bosc i fa ombra", "arbre")).toEqual({
			ok: true,
		});
	});

	it("rejects an empty clue", () => {
		expect(validateClueText("   ", "arbre")).toEqual({
			ok: false,
			reason: "empty",
		});
	});

	it("rejects a clue longer than the limit", () => {
		const longClue = "a ".repeat(MAX_CLUE_LENGTH);
		expect(validateClueText(longClue, "arbre")).toEqual({
			ok: false,
			reason: "too_long",
		});
	});

	it("rejects the answer verbatim, regardless of accents/case", () => {
		expect(validateClueText("ÀRBRE", "arbre")).toEqual({
			ok: false,
			reason: "too_similar",
		});
	});

	it("rejects the answer embedded in a sentence", () => {
		expect(validateClueText("és un arbre molt alt", "arbre")).toEqual({
			ok: false,
			reason: "too_similar",
		});
	});

	it("rejects an inflection that keeps the answer as a prefix", () => {
		expect(validateClueText("plural: arbres", "arbre")).toEqual({
			ok: false,
			reason: "too_similar",
		});
	});

	it("rejects a truncation of the answer", () => {
		// "munta" is "muntanya" cut short — still reveals it.
		expect(validateClueText("puja fins a munta", "muntanya")).toEqual({
			ok: false,
			reason: "too_similar",
		});
	});

	it("allows a near-miss spelling that isn't an inflection or truncation", () => {
		// One substitution away from "arbre"; coincidental near-spellings aren't
		// blocked, matching the AI generator's leak standard.
		expect(validateClueText("arbra", "arbre")).toEqual({ ok: true });
	});

	it("allows a real word whose letters sit inside the answer", () => {
		// "anca" is a substring of "branca" but an unrelated, legitimate word.
		expect(validateClueText("li fa mal l'anca", "branca")).toEqual({
			ok: true,
		});
	});

	it("allows short unrelated words even if a few letters overlap", () => {
		expect(validateClueText("té fulles verdes", "arbre")).toEqual({
			ok: true,
		});
	});
});
