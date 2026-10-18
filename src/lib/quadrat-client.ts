import { decodeRevealedAnswers, resolveGuess } from "@/lib/puzzle-client";
import { openHintCapsule } from "@/lib/puzzle-crypto";
import { normalizeWord } from "@/lib/puzzle-text";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { findWordPaths, getWordFromPath } from "@/lib/quadrat-board";
import { getStartCapsuleKey } from "@/lib/quadrat-snapshot";
import type { QuadratPuzzlePublic, QuadratWordSlot } from "@/lib/quadrat-types";

export function resolveQuadratGuess({
	puzzle,
	progress,
	path,
}: {
	puzzle: QuadratPuzzlePublic;
	progress: PuzzleProgressState;
	path: readonly number[];
}) {
	return resolveGuess({
		puzzle,
		progress,
		guess: getWordFromPath(puzzle.letters, path),
	});
}

export type QuadratFoundWords = {
	answers: Record<number, string>;
	paths: Record<number, number[]>;
};

// Each word traces exactly one path on its board, so a found word's path
// follows from its letters.
export async function decodeQuadratFoundWords(
	puzzle: QuadratPuzzlePublic,
	progress: PuzzleProgressState,
): Promise<QuadratFoundWords> {
	const answers = await decodeRevealedAnswers(puzzle, progress);
	const paths: Record<number, number[]> = {};
	for (const [id, answer] of Object.entries(answers)) {
		const [path, ...others] = findWordPaths(
			puzzle.letters,
			normalizeWord(answer),
		);
		if (!path || others.length > 0) {
			throw new Error(`Quadrat word ${id} does not trace exactly one path`);
		}
		paths[Number(id)] = path;
	}
	return { answers, paths };
}

export async function openQuadratClueStart(
	slot: Pick<QuadratWordSlot, "id" | "startSalt" | "startCapsule">,
): Promise<[number, number]> {
	const opened = await openHintCapsule(
		slot.startCapsule,
		slot.startSalt,
		getStartCapsuleKey(slot.id),
	);
	const [first, second] = opened.split(",").map(Number);
	if (!Number.isInteger(first) || !Number.isInteger(second)) {
		throw new Error(`Quadrat word ${slot.id} has an unreadable clue start`);
	}
	return [first as number, second as number];
}
