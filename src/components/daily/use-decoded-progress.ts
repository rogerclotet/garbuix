import { useEffect, useReducer, useState } from "react";
import { decodeHintLetters, decodeRevealedAnswers } from "@/lib/puzzle-client";
import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";
import { useObservability } from "@/lib/use-observability";

type DecodedProgress = {
	identity: string;
	progressKey: string;
	progress: PuzzleProgressState;
	answers: Record<number, string>;
	hints: Record<string, string>;
};

// Publish progress and its decrypted letters together. While decoding an update,
// keep the previous complete frame, including its counters and word list.
export function useDecodedProgress({
	puzzle,
	progress,
	userId,
	enabled,
}: {
	puzzle: DailyPuzzlePublic;
	progress: PuzzleProgressState;
	userId: string | null;
	enabled: boolean;
}) {
	const identity = JSON.stringify([puzzle.id, userId]);
	const progressKey = JSON.stringify(progress);
	const [decoded, setDecoded] = useState<DecodedProgress | null>(null);
	const [failure, setFailure] = useState<{
		identity: string;
		progressKey: string;
	} | null>(null);
	const [attempt, retry] = useReducer((value: number) => value + 1, 0);
	const { captureException } = useObservability();
	const needsDecoding =
		progress.guessedWordIds.length > 0 || progress.hintedCells.length > 0;

	useIsomorphicLayoutEffect(() => {
		if (!enabled) {
			setDecoded(null);
		} else if (!needsDecoding) {
			setDecoded((current) =>
				current?.identity === identity && current.progressKey === progressKey
					? current
					: { identity, progressKey, progress, answers: {}, hints: {} },
			);
		}
	}, [enabled, needsDecoding, identity, progressKey, progress]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt allows a failed decode to be retried.
	useEffect(() => {
		if (!enabled || !needsDecoding) return;
		let cancelled = false;
		void Promise.all([
			decodeRevealedAnswers(puzzle, progress),
			decodeHintLetters(puzzle, progress),
		])
			.then(([answers, hints]) => {
				if (cancelled) return;
				setFailure(null);
				setDecoded((current) =>
					current?.identity === identity && current.progressKey === progressKey
						? current
						: { identity, progressKey, progress, answers, hints },
				);
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setFailure({ identity, progressKey });
					captureException(error, {
						puzzle_date: puzzle.dateKey,
						scope: "decode_progress",
					});
				}
			});
		return () => {
			cancelled = true;
		};
	}, [
		enabled,
		needsDecoding,
		identity,
		progressKey,
		progress,
		puzzle,
		captureException,
		attempt,
	]);

	return {
		snapshot: enabled && decoded?.identity === identity ? decoded : null,
		hasError:
			enabled &&
			failure?.identity === identity &&
			failure.progressKey === progressKey,
		retry,
	};
}
