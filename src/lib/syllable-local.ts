import { z } from "zod";
import { dateKeyToSeed, isPlayableDateKey } from "@/lib/puzzle-dates";
import { progressStateSchema } from "@/lib/puzzle-event-schemas";
import type {
	HistorySummaryEntry,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { SYLLABLE_WORD_COUNT } from "@/lib/syllable-types";

const savedSchema = z.record(
	z.string().refine(isPlayableDateKey),
	progressStateSchema,
);
export function syllableStorageKey(userId: string | null) {
	return `garbuix-syllable-v1:${userId ?? "guest"}`;
}

export function readSyllableSaves(
	userId: string | null,
): Record<string, PuzzleProgressState> {
	if (typeof window === "undefined") return {};
	try {
		const parsed = savedSchema.safeParse(
			JSON.parse(localStorage.getItem(syllableStorageKey(userId)) ?? "{}"),
		);
		if (!parsed.success) return {};
		return Object.fromEntries(
			Object.entries(parsed.data).filter(
				([dateKey, progress]) => progress.puzzleId === `syllable:${dateKey}`,
			),
		);
	} catch {
		return {};
	}
}

export function writeSyllableSave(
	userId: string | null,
	dateKey: string,
	progress: PuzzleProgressState,
) {
	const saves = readSyllableSaves(userId);
	localStorage.setItem(
		syllableStorageKey(userId),
		JSON.stringify({ ...saves, [dateKey]: progress }),
	);
}

export function syllableHistoryEntries(
	userId: string | null,
): HistorySummaryEntry[] {
	return Object.entries(readSyllableSaves(userId))
		.map(([dateKey, progress]) => ({
			dateKey,
			seed: dateKeyToSeed(dateKey),
			totalWords: SYLLABLE_WORD_COUNT,
			guessedWords: progress.guessedWordIds.length,
			guessCount: progress.guessCount,
			hintsUsed: progress.hintsUsed,
			completed: progress.completedAt !== null,
			lastUpdated: progress.lastSyncedAt ?? `${dateKey}T12:00:00.000Z`,
		}))
		.sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}
