import { useEffect, useMemo, useReducer, useRef } from "react";
import { getWordClues } from "@/lib/puzzle-server-fns";
import { useObservability } from "@/lib/use-observability";

// Generation can finish after a new puzzle is opened. Four attempts cover that
// window without spending most of the hourly quota on one missing clue.
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000];
const MAX_WORDS_PER_REQUEST = 20;

type ClueCache = {
	puzzleId: string;
	userId: string | null;
	clues: Record<number, string>;
	pending: Map<number, { attempts: number; retryAt: number }>;
	unavailable: Set<number>;
	inFlight: boolean;
};

export function useWordClues(options: {
	puzzleId: string;
	userId: string | null;
	wordIds: number[];
	pendingEventCount: number;
}) {
	const { puzzleId, userId, pendingEventCount } = options;
	const wordIdsKey = [...new Set(options.wordIds)]
		.sort((a, b) => a - b)
		.join(",");
	const canFetch = pendingEventCount === 0;
	const { captureException } = useObservability();
	const [revision, refresh] = useReducer((value: number) => value + 1, 0);
	// The quota spans puzzles. Changing the viewed puzzle must not bypass a
	// cooldown already returned by the server.
	const retryAt = useRef(0);
	const cache = useMemo<ClueCache>(
		() => ({
			puzzleId,
			userId,
			clues: {},
			pending: new Map<number, { attempts: number; retryAt: number }>(),
			unavailable: new Set<number>(),
			inFlight: false,
		}),
		[puzzleId, userId],
	);

	// revision wakes the scheduler after a response or retry timer. The cache
	// survives these effect runs, including runs caused by unrelated progress.
	// biome-ignore lint/correctness/useExhaustiveDependencies: revision is the scheduler wake-up signal.
	useEffect(() => {
		if (!canFetch || cache.inFlight || wordIdsKey === "") return;

		const wordIds = wordIdsKey.split(",").map(Number);
		const missing = wordIds.filter(
			(wordId) => !cache.clues[wordId] && !cache.unavailable.has(wordId),
		);
		if (missing.length === 0) return;

		const now = Date.now();
		for (const wordId of missing) {
			if (!cache.pending.has(wordId)) {
				cache.pending.set(wordId, { attempts: 0, retryAt: now });
			}
		}
		const ready = missing.filter(
			(wordId) => (cache.pending.get(wordId)?.retryAt ?? now) <= now,
		);
		if (retryAt.current > now || ready.length === 0) {
			const nextAttempt = Math.max(
				retryAt.current,
				Math.min(...missing.map((id) => cache.pending.get(id)?.retryAt ?? now)),
			);
			const timer = window.setTimeout(refresh, nextAttempt - now);
			return () => window.clearTimeout(timer);
		}

		const requested = ready.slice(0, MAX_WORDS_PER_REQUEST);
		cache.inFlight = true;
		void getWordClues({
			data: { puzzleId: cache.puzzleId, wordIds: requested },
		})
			.then((result) => {
				if (result.kind === "rate_limited") {
					retryAt.current = Date.now() + result.retryAfterSeconds * 1000;
					return;
				}

				cache.clues = { ...cache.clues, ...result.clues };
				for (const wordId of requested) {
					if (cache.clues[wordId]) {
						cache.pending.delete(wordId);
						continue;
					}
					const attempts = cache.pending.get(wordId)?.attempts ?? 0;
					const delay = RETRY_DELAYS_MS[attempts];
					if (delay === undefined) {
						cache.unavailable.add(wordId);
						cache.pending.delete(wordId);
					} else {
						cache.pending.set(wordId, {
							attempts: attempts + 1,
							retryAt: Date.now() + delay,
						});
					}
				}
			})
			.catch((error: unknown) => {
				captureException(error, {
					puzzle_id: cache.puzzleId,
					scope: "load_word_clues",
				});
				for (const wordId of requested) {
					cache.unavailable.add(wordId);
					cache.pending.delete(wordId);
				}
			})
			.finally(() => {
				cache.inFlight = false;
				refresh();
			});
	}, [cache, canFetch, wordIdsKey, captureException, revision]);

	return cache.clues;
}
