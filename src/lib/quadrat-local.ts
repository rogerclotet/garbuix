import { z } from "zod";
import { dateKeyToSeed, isPlayableDateKey } from "@/lib/puzzle-dates";
import { progressStateSchema } from "@/lib/puzzle-event-schemas";
import type {
	HistorySummaryEntry,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { QUADRAT_WORD_COUNT } from "@/lib/quadrat-types";

const savedSchema = z.record(
	z.string().refine(isPlayableDateKey),
	progressStateSchema,
);

export function quadratPuzzleId(dateKey: string): string {
	return `quadrat:${dateKey}`;
}

export function quadratStorageKey(userId: string | null): string {
	return `garbuix-quadrat-v1:${userId ?? "guest"}`;
}

export function readQuadratSaves(
	userId: string | null,
): Record<string, PuzzleProgressState> {
	if (typeof window === "undefined") return {};
	let raw: string | null;
	try {
		raw = localStorage.getItem(quadratStorageKey(userId));
	} catch (error) {
		// Browsers that block storage throw a SecurityError; play goes on unsaved.
		if (error instanceof DOMException) return {};
		throw error;
	}
	if (raw === null) return {};
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		// A save corrupted outside the app cannot be recovered; start over.
		return {};
	}
	const parsed = savedSchema.safeParse(json);
	if (!parsed.success) return {};
	return Object.fromEntries(
		Object.entries(parsed.data).filter(
			([dateKey, progress]) => progress.puzzleId === quadratPuzzleId(dateKey),
		),
	);
}

export function writeQuadratSave(
	userId: string | null,
	dateKey: string,
	progress: PuzzleProgressState,
): void {
	const saves = readQuadratSaves(userId);
	localStorage.setItem(
		quadratStorageKey(userId),
		JSON.stringify({ ...saves, [dateKey]: progress }),
	);
}

export function quadratHistoryEntries(
	userId: string | null,
): HistorySummaryEntry[] {
	return Object.entries(readQuadratSaves(userId))
		.map(([dateKey, progress]) => ({
			dateKey,
			seed: dateKeyToSeed(dateKey),
			totalWords: QUADRAT_WORD_COUNT,
			guessedWords: progress.guessedWordIds.length,
			guessCount: progress.guessCount,
			hintsUsed: progress.hintsUsed,
			completed: progress.completedAt !== null,
			lastUpdated: progress.lastSyncedAt ?? `${dateKey}T12:00:00.000Z`,
		}))
		.sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}

const TUTORIAL_SEEN_KEY = "garbuix-quadrat-tutorial-seen-v1";

// Set when the player finishes or skips the tutorial. Leaving halfway shows
// it again on the next visit.
export function hasSeenQuadratTutorial(): boolean {
	if (typeof window === "undefined") return true;
	try {
		return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1";
	} catch (error) {
		// Without storage the tutorial would come back on every visit.
		if (error instanceof DOMException) return true;
		throw error;
	}
}

export function markQuadratTutorialSeen(): void {
	try {
		localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
	} catch (error) {
		// A blocked write only means the tutorial shows again next time.
		if (!(error instanceof DOMException)) throw error;
	}
}

// A finished or skipped tutorial, or a save from any move, means the player
// has found the game already.
export function hasPlayedQuadrat(userId: string | null): boolean {
	if (hasSeenQuadratTutorial()) return true;
	if (Object.keys(readQuadratSaves(null)).length > 0) return true;
	return userId !== null && Object.keys(readQuadratSaves(userId)).length > 0;
}
