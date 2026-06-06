import { normalizeWord } from "@/lib/puzzle-text";

// Keeps a peer clue from spoiling the answer without being so strict that it
// blocks legitimate clues. A token only counts as a leak when it's the answer
// itself, an inflection of it (plural/feminine/diminutive/conjugation all keep
// the answer as a prefix), or a clear truncation of it. Coincidental overlap —
// a short common word whose letters happen to sit inside the answer, or a coined
// near-spelling — is allowed. This is the same standard the AI clue generator is
// held to, so an AI-suggested clue always passes here. Validation runs
// server-side because only the server holds the plaintext answer.

export const MAX_CLUE_LENGTH = 140;

export type ClueFairnessResult = { ok: true } | { ok: false; reason: string };

// Returns the original tokens of `clue` that reveal the hidden word. Tokens
// shorter than 3 normalized letters are ignored so common short words never
// trip the check. Shared by the clue generator (which masks these as a last
// resort) and the peer-clue validator (which rejects on any leak).
export function findLeakingTokens(
	clue: string,
	normalizedAnswer: string,
): string[] {
	const answer = normalizeWord(normalizedAnswer);
	if (!answer) {
		return [];
	}

	// Keep middots inside tokens so normalizeWord can fold "l·l" → "ll".
	const tokens = clue.split(/[^\p{L}·]+/u).filter(Boolean);
	const leaks: string[] = [];

	for (const token of tokens) {
		const normalizedToken = normalizeWord(token);
		if (normalizedToken.length < 3) {
			continue;
		}

		const isInflectionOrMatch =
			normalizedToken === answer || normalizedToken.startsWith(answer);
		const isTruncation =
			answer.length >= 5 &&
			normalizedToken.length >= 4 &&
			answer.startsWith(normalizedToken);

		if (isInflectionOrMatch || isTruncation) {
			leaks.push(token);
		}
	}

	return leaks;
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

	if (findLeakingTokens(trimmed, normalizedAnswer).length > 0) {
		return { ok: false, reason: "too_similar" };
	}

	return { ok: true };
}
