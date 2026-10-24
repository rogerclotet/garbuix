import { useEffect, useRef } from "react";
import {
	flushGuestProgressReports,
	reportGuestProgress,
} from "@/lib/guest-progress-outbox";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import type { GuestProgressReport } from "@/lib/usage-stats";

// Tells the server when a guest starts or finishes the day's puzzle, for the
// usage statistics. Signed-in players are counted from their progress sync
// instead. Reports made offline go out once the connection is back.
export function useGuestProgressReport({
	game,
	dateKey,
	progress,
	userId,
	ready,
}: {
	game: GuestProgressReport["game"];
	dateKey: string;
	progress: Pick<PuzzleProgressState, "guessCount" | "completedAt">;
	userId: string | null;
	ready: boolean;
}): void {
	const lastReported = useRef<string | null>(null);
	const started = progress.guessCount > 0;
	const completed = progress.completedAt !== null;

	useEffect(() => {
		if (!ready || userId || !started) return;
		const reportKey = `${dateKey}:${completed}`;
		if (lastReported.current === reportKey) return;
		lastReported.current = reportKey;
		void reportGuestProgress({ game, dateKey, completed });
	}, [completed, dateKey, game, ready, started, userId]);

	useEffect(() => {
		void flushGuestProgressReports();
		const flush = () => void flushGuestProgressReports();
		window.addEventListener("online", flush);
		return () => window.removeEventListener("online", flush);
	}, []);
}
