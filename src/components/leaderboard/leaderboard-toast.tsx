import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { LeaderboardEvent } from "@/lib/leaderboard-types";
import { useLeaderboard } from "@/lib/use-leaderboard";

const COALESCE_WINDOW_MS = 5_000;
const GLOBAL_TOAST_GAP_MS = 1_500;

type PendingBatch = {
	participantId: string;
	name: string;
	kind: LeaderboardEvent["entry"]["kind"];
	wordsAdded: number;
	wordsFound: number;
	totalWords: number;
	completedAt: string | null;
	scheduledFor: number;
	timer: ReturnType<typeof setTimeout> | null;
};

export function LeaderboardToasts() {
	const { subscribe, localParticipantId } = useLeaderboard();
	const pendingRef = useRef<Map<string, PendingBatch>>(new Map());
	const nextEmitAtRef = useRef<number>(0);

	useEffect(() => {
		const flushBatch = (participantId: string) => {
			const batch = pendingRef.current.get(participantId);
			if (!batch) return;
			pendingRef.current.delete(participantId);

			const now = Date.now();
			const wait = Math.max(0, nextEmitAtRef.current - now);
			nextEmitAtRef.current = now + wait + GLOBAL_TOAST_GAP_MS;

			window.setTimeout(() => {
				const progress =
					batch.totalWords > 0
						? ` (${batch.wordsFound}/${batch.totalWords})`
						: "";
				let message: string;
				if (batch.completedAt) {
					message = `${batch.name} ha trobat totes les paraules!`;
				} else if (batch.wordsAdded === 1) {
					message = `${batch.name} ha trobat una paraula nova${progress}`;
				} else {
					message = `${batch.name} ha trobat ${batch.wordsAdded} paraules${progress}`;
				}

				toast(message, {
					duration: 8_000,
					onAutoClose: () => {},
				});
			}, wait);
		};

		const handleEvent = (event: LeaderboardEvent) => {
			if (event.entry.participantId === localParticipantId) {
				return;
			}
			if (!event.delta.justCompleted && event.delta.wordsAdded <= 0) {
				return;
			}

			const existing = pendingRef.current.get(event.entry.participantId);
			const now = Date.now();
			if (existing) {
				existing.wordsAdded += event.delta.wordsAdded;
				existing.wordsFound = event.entry.wordsFound;
				existing.totalWords = event.entry.totalWords;
				existing.completedAt = event.entry.completedAt ?? existing.completedAt;
				if (event.delta.justCompleted && existing.timer) {
					clearTimeout(existing.timer);
					existing.timer = null;
					flushBatch(event.entry.participantId);
				}
				return;
			}

			const batch: PendingBatch = {
				participantId: event.entry.participantId,
				name: event.entry.name,
				kind: event.entry.kind,
				wordsAdded: event.delta.wordsAdded,
				wordsFound: event.entry.wordsFound,
				totalWords: event.entry.totalWords,
				completedAt: event.entry.completedAt,
				scheduledFor: now + COALESCE_WINDOW_MS,
				timer: null,
			};
			pendingRef.current.set(event.entry.participantId, batch);

			if (event.delta.justCompleted) {
				flushBatch(event.entry.participantId);
				return;
			}

			batch.timer = setTimeout(() => {
				flushBatch(event.entry.participantId);
			}, COALESCE_WINDOW_MS);
		};

		const unsubscribe = subscribe(handleEvent);
		return () => {
			unsubscribe();
			for (const batch of pendingRef.current.values()) {
				if (batch.timer) clearTimeout(batch.timer);
			}
			pendingRef.current.clear();
		};
	}, [subscribe, localParticipantId]);

	return null;
}
