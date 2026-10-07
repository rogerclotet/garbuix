import {
	drawPuzzleCard,
	measurePuzzleCard,
	type PuzzleCardInput,
	type PuzzleCardStat,
} from "@/lib/puzzle-card";
import { formatMadridTime } from "@/lib/puzzle-dates";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";

const STREAK_THRESHOLD = 3;
const SHARE_FONT_FAMILY =
	"'Nunito Variable', system-ui, -apple-system, sans-serif";

export type ShareCompletionStats = {
	guessCount: number;
	hintsUsed: number;
	completedAt: string | null;
	currentStreak: number;
};

function buildStatItems(stats: ShareCompletionStats): PuzzleCardStat[] {
	const items: PuzzleCardStat[] = [
		{
			value: String(stats.guessCount),
			label: stats.guessCount === 1 ? "Intent" : "Intents",
		},
		{
			value: String(stats.hintsUsed),
			label: stats.hintsUsed === 1 ? "Pista" : "Pistes",
		},
	];

	if (stats.completedAt) {
		const completedDate = new Date(stats.completedAt);
		if (!Number.isNaN(completedDate.getTime())) {
			items.push({
				value: formatMadridTime(completedDate),
				label: "Acabat",
			});
		}
	}

	if (stats.currentStreak >= STREAK_THRESHOLD) {
		items.push({
			value: `${stats.currentStreak} 🔥`,
			label: stats.currentStreak === 1 ? "Ratxa (dia)" : "Ratxa (dies)",
		});
	}

	return items;
}

export function renderProgressCanvas(
	puzzle: DailyPuzzlePublic,
	revealedCells: Set<string>,
	guessedCount: number,
	totalWords: number,
	completionStats?: ShareCompletionStats,
): HTMLCanvasElement {
	const card: PuzzleCardInput = {
		rows: puzzle.rows,
		cols: puzzle.cols,
		gridMask: puzzle.gridMask,
		letters: puzzle.initialShuffledLetters,
		revealedCells,
		dateKey: puzzle.dateKey,
		detail: `${guessedCount} / ${totalWords} paraules`,
		stats: completionStats ? buildStatItems(completionStats) : [],
	};
	const { width, height } = measurePuzzleCard(card);

	const dpr = Math.min(window.devicePixelRatio || 1, 3);
	const canvas = document.createElement("canvas");
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Canvas 2D context is unavailable.");
	}
	ctx.scale(dpr, dpr);
	drawPuzzleCard(ctx, card, SHARE_FONT_FAMILY);

	return canvas;
}

export type ShareResult = "shared" | "copied" | "downloaded";

export async function shareProgress(
	puzzle: DailyPuzzlePublic,
	revealedCells: Set<string>,
	guessedCount: number,
	totalWords: number,
	completionStats?: ShareCompletionStats,
): Promise<ShareResult> {
	const canvas = renderProgressCanvas(
		puzzle,
		revealedCells,
		guessedCount,
		totalWords,
		completionStats,
	);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => {
			if (b) resolve(b);
			else reject(new Error("Failed to create image"));
		}, "image/png");
	});

	const text = `${guessedCount}/${totalWords} https://garbuix.app`;

	if (
		typeof navigator !== "undefined" &&
		typeof navigator.share === "function" &&
		typeof navigator.canShare === "function"
	) {
		const file = new File([blob], `garbuix-${puzzle.dateKey}.png`, {
			type: "image/png",
		});
		const shareData: ShareData = { text, files: [file] };

		if (navigator.canShare(shareData)) {
			try {
				await navigator.share(shareData);
				return "shared";
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return "shared";
				}
			}
		}
	}

	// Fallback: copy image to clipboard
	try {
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		return "copied";
	} catch {
		// Last resort: download
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `garbuix-${puzzle.dateKey}.png`;
		a.click();
		URL.revokeObjectURL(url);
		return "downloaded";
	}
}
