import { normalizeWord } from "@/lib/puzzle-text";

// Keeps a peer clue from spoiling the answer: a clue is rejected when any of its
// words is the answer, contains/is-contained-by the answer, or is a near-miss
// spelling (a small edit distance away, catching plurals and light inflections).
// Validation runs server-side because only the server holds the plaintext answer.

export const MAX_CLUE_LENGTH = 140;

export type ClueFairnessResult = { ok: true } | { ok: false; reason: string };

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
	let currentRow = new Array<number>(b.length + 1);

	for (let i = 0; i < a.length; i++) {
		currentRow[0] = i + 1;
		for (let j = 0; j < b.length; j++) {
			const substitutionCost = a[i] === b[j] ? 0 : 1;
			currentRow[j + 1] = Math.min(
				currentRow[j] + 1, // insertion
				previousRow[j + 1] + 1, // deletion
				previousRow[j] + substitutionCost, // substitution
			);
		}
		[previousRow, currentRow] = [currentRow, previousRow];
	}

	return previousRow[b.length];
}

function nearMissThreshold(length: number): number {
	return Math.max(1, Math.floor(length * 0.34));
}

// Splits a clue into normalized word tokens (accents/middots stripped), dropping
// punctuation so "és l'arbre?" yields ["es", "l", "arbre"].
function tokenize(text: string): string[] {
	return text
		.split(/[^\p{L}\p{N}]+/u)
		.map((token) => normalizeWord(token))
		.filter((token) => token.length > 0);
}

export function validateClueText(
	text: string,
	normalizedAnswer: string,
): ClueFairnessResult {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return { ok: false, reason: "empty" };
	}
	if (trimmed.length > MAX_CLUE_LENGTH) {
		return { ok: false, reason: "too_long" };
	}

	const answer = normalizeWord(normalizedAnswer);
	if (answer.length === 0) {
		return { ok: true };
	}

	const threshold = nearMissThreshold(answer.length);

	for (const token of tokenize(trimmed)) {
		if (token === answer) {
			return { ok: false, reason: "too_similar" };
		}
		// Substring either way catches stems and the answer hidden inside a word.
		if (token.includes(answer) || answer.includes(token)) {
			return { ok: false, reason: "too_similar" };
		}
		if (levenshtein(token, answer) <= threshold) {
			return { ok: false, reason: "too_similar" };
		}
	}

	return { ok: true };
}
