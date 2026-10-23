import { useEffect, useRef } from "react";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import type { GuestProgressReport } from "@/lib/usage-stats";
import { canReportUsage } from "@/lib/usage-stats-preference";

// Tells the server when a guest starts or finishes the day's Mini, Síl·labes
// or Quadrat, for the usage statistics. Their progress never leaves the browser
// otherwise. Signed-in players are counted from their progress sync instead.
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
		if (!canReportUsage()) return;
		lastReported.current = reportKey;

		const report: GuestProgressReport = { game, dateKey, completed };
		void fetch("/api/guest-progress", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(report),
			// The finishing move can be the last thing before the tab closes.
			keepalive: true,
		}).catch(() => {
			// Non-fatal: a lost report only undercounts the day's statistics.
		});
	}, [completed, dateKey, game, ready, started, userId]);
}
