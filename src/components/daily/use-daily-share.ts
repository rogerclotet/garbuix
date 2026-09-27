import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getSkipSharePreview } from "@/lib/anon-identity";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { setDailyHeaderSummary } from "./daily-header-store";
import { type ShareCompletionStats, shareProgress } from "./share-progress";

export function useDailyShare({
	puzzle,
	revealedCells,
	guessedCount,
	completionStats,
	isPresentable,
}: {
	puzzle: DailyPuzzlePublic;
	revealedCells: Set<string>;
	guessedCount: number;
	completionStats: ShareCompletionStats | undefined;
	isPresentable: boolean;
}) {
	const totalWords = puzzle.wordSlots.length;
	const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
	// Lets the header's share button reach the latest handler without making the
	// published summary churn on every render.
	const handleShareRef = useRef<() => Promise<void>>(async () => {});
	const openShare = useCallback(() => {
		if (getSkipSharePreview()) {
			void handleShareRef.current();
			return;
		}
		setSharePreviewOpen(true);
	}, []);

	const handleShare = useCallback(async () => {
		try {
			const result = await shareProgress(
				puzzle,
				revealedCells,
				guessedCount,
				totalWords,
				completionStats,
			);
			if (result === "copied") {
				toast.success("Imatge copiada!");
			}
		} catch {
			toast.error("No s'ha pogut compartir");
		}
	}, [completionStats, puzzle, revealedCells, guessedCount, totalWords]);

	// Kept current every render: the header's share button reaches the handler
	// through this ref, and openShare is published to the header only once.
	handleShareRef.current = handleShare;

	// The header (rendered above this route) owns the share button, so it needs
	// a way to reach the board's share handler.
	useEffect(() => {
		setDailyHeaderSummary(isPresentable ? { onShare: openShare } : null);
	}, [openShare, isPresentable]);

	useEffect(() => () => setDailyHeaderSummary(null), []);

	return { sharePreviewOpen, setSharePreviewOpen, handleShare };
}
