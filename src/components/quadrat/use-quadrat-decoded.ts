import { useEffect, useReducer, useState } from "react";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import {
	decodeQuadratFoundWords,
	openQuadratClueStart,
	type QuadratFoundWords,
} from "@/lib/quadrat-client";
import type { QuadratPuzzlePublic } from "@/lib/quadrat-types";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

export type QuadratDecodedFrame = QuadratFoundWords & {
	progressKey: string;
	progress: PuzzleProgressState;
	// First two cells of each clued word, lit on the board until it is found.
	clueStarts: Record<number, [number, number]>;
};

async function decodeFrame(
	puzzle: QuadratPuzzlePublic,
	progress: PuzzleProgressState,
	progressKey: string,
): Promise<QuadratDecodedFrame> {
	const [found, starts] = await Promise.all([
		decodeQuadratFoundWords(puzzle, progress),
		Promise.all(
			puzzle.wordSlots
				.filter((slot) => progress.clueWordIds.includes(slot.id))
				.map(
					async (slot) => [slot.id, await openQuadratClueStart(slot)] as const,
				),
		),
	]);
	return {
		...found,
		progressKey,
		progress,
		clueStarts: Object.fromEntries(starts),
	};
}

// Publishes progress together with the words and paths it unlocks. While an
// update decodes, the previous frame stays up so counts and the word list
// never disagree.
export function useQuadratDecoded({
	puzzle,
	progress,
	enabled,
}: {
	puzzle: QuadratPuzzlePublic;
	progress: PuzzleProgressState;
	enabled: boolean;
}) {
	const progressKey = JSON.stringify(progress);
	const [frame, setFrame] = useState<QuadratDecodedFrame | null>(null);
	const [failedKey, setFailedKey] = useState<string | null>(null);
	const [attempt, retry] = useReducer((value: number) => value + 1, 0);
	const needsDecoding =
		progress.guessedWordIds.length > 0 || progress.clueWordIds.length > 0;

	// A fresh board has nothing to open, so it paints on the first frame.
	useIsomorphicLayoutEffect(() => {
		if (!enabled || needsDecoding) return;
		setFrame((current) =>
			current?.progressKey === progressKey
				? current
				: { progressKey, progress, answers: {}, paths: {}, clueStarts: {} },
		);
	}, [enabled, needsDecoding, progressKey, progress]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt allows a failed decode to be retried.
	useEffect(() => {
		if (!enabled || !needsDecoding) return;
		let cancelled = false;
		decodeFrame(puzzle, progress, progressKey).then(
			(next) => {
				if (cancelled) return;
				setFailedKey(null);
				setFrame((current) =>
					current?.progressKey === progressKey ? current : next,
				);
			},
			(error: unknown) => {
				if (cancelled) return;
				console.error("[quadrat] Could not decode progress", error);
				setFailedKey(progressKey);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [enabled, needsDecoding, progressKey, puzzle, attempt]);

	return {
		frame: enabled ? frame : null,
		hasError: enabled && failedKey === progressKey,
		retry,
	};
}
