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

	it("rejects a token that contains the answer as a substring", () => {
		expect(validateClueText("plural: arbres", "arbre")).toEqual({
			ok: false,
			reason: "too_similar",
		});
	});

	it("rejects a near-miss spelling", () => {
		// one substitution away from "arbre"
		expect(validateClueText("arbra", "arbre")).toEqual({
			ok: false,
			reason: "too_similar",
		});
	});

	it("allows short unrelated words even if a few letters overlap", () => {
		expect(validateClueText("té fulles verdes", "arbre")).toEqual({
			ok: true,
		});
	});
});
