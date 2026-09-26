import { z } from "zod";
import { MINI_WORD_COUNT } from "@/lib/mini-generator";
import { dateKeyToSeed, isPlayableDateKey } from "@/lib/puzzle-dates";
import { progressStateSchema } from "@/lib/puzzle-event-schemas";
import type {
	HistorySummaryEntry,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

const savedSchema = z.record(
	z.string().refine(isPlayableDateKey),
	progressStateSchema,
);
export function miniStorageKey(userId: string | null) {
	return `garbuix-mini-v1:${userId ?? "guest"}`;
}

export function readMiniSaves(
	userId: string | null,
): Record<string, PuzzleProgressState> {
	if (typeof window === "undefined") return {};
	try {
		const parsed = savedSchema.safeParse(
			JSON.parse(localStorage.getItem(miniStorageKey(userId)) ?? "{}"),
		);
		if (!parsed.success) return {};
		return Object.fromEntries(
			Object.entries(parsed.data).filter(
				([dateKey, progress]) => progress.puzzleId === `mini:${dateKey}`,
			),
		);
	} catch {
		return {};
	}
}

export function writeMiniSave(
	userId: string | null,
	dateKey: string,
	progress: PuzzleProgressState,
) {
	const saves = readMiniSaves(userId);
	localStorage.setItem(
		miniStorageKey(userId),
		JSON.stringify({ ...saves, [dateKey]: progress }),
	);
}

export function miniHistoryEntries(
	userId: string | null,
): HistorySummaryEntry[] {
	return Object.entries(readMiniSaves(userId))
		.map(([dateKey, progress]) => ({
			dateKey,
			seed: dateKeyToSeed(dateKey),
			totalWords: MINI_WORD_COUNT,
			guessedWords: progress.guessedWordIds.length,
			guessCount: progress.guessCount,
			hintsUsed: progress.hintsUsed,
			completed: progress.completedAt !== null,
			lastUpdated: progress.lastSyncedAt ?? `${dateKey}T12:00:00.000Z`,
		}))
		.sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}
