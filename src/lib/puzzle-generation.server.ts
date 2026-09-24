import { eq } from "drizzle-orm";
import guessWords from "@/data/catalan-guess-words.json";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { dailyPuzzles } from "@/db/schema";
import { generateAndStoreCluesForPuzzle } from "@/lib/clue-generator.server";
import { generateDailyCrosswordForSeed } from "@/lib/crossword-generator";
import { db } from "@/lib/db";
import {
	captureServerEvent,
	captureServerException,
} from "@/lib/observability-server";
import { hashText } from "@/lib/puzzle-crypto";
import { dateKeyToSeed, getTodayDateKey } from "@/lib/puzzle-dates";
import {
	buildNormalizedDictionary,
	getValidNormalizedGuessesForLetters,
} from "@/lib/puzzle-dictionary";
import {
	buildWordFrequencyLookup,
	computeDifficultyForNormalizedWords,
	type PuzzleDifficulty,
	toPuzzleDifficulty,
} from "@/lib/puzzle-difficulty";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import type { DailyPuzzlePrivateWord } from "@/lib/puzzle-types";

export const PUZZLE_ALGORITHM_VERSION = "3";

// Puzzles are generated only from the common-word dictionary (frequency-floored),
// while guesses are validated against the wider name-only dictionary so players
// get credit for any corpus-attested word, however rare. See
// scripts/download-catalan-dictionary.ts.
const serverWords = allWords as Word[];
const normalizedServerWords = buildNormalizedDictionary(guessWords);

let cachedDictionaryVersion: Promise<string> | null = null;
let cachedFrequencyLookup: Map<string, number> | null = null;
const validNormalizedGuessesCache = new Map<string, string[]>();
const inProgressGenerations = new Map<string, Promise<void>>();
const cluesGenerationStarted = new Set<string>();

function getFrequencyLookup() {
	if (!cachedFrequencyLookup) {
		cachedFrequencyLookup = buildWordFrequencyLookup(serverWords);
	}
	return cachedFrequencyLookup;
}

// Re-score stored puzzles on read so older ratings pick up formula changes.
// Persist only when the column or public snapshot disagrees with the new rating.
async function ensurePuzzleRowDifficulty(
	row: typeof dailyPuzzles.$inferSelect,
): Promise<typeof dailyPuzzles.$inferSelect> {
	const difficulty = computeDifficultyForNormalizedWords({
		normalizedWords: row.privateSnapshotJson.wordSlots.map(
			(slot) => slot.normalizedWord,
		),
		frequencyLookup: getFrequencyLookup(),
		availableWordCount: getDailyValidNormalizedGuesses(
			row.privateSnapshotJson.letters,
		).length,
	});
	if (
		difficulty == null ||
		(row.difficulty === difficulty &&
			row.publicSnapshotJson.difficulty === difficulty)
	) {
		return row;
	}

	const publicSnapshotJson = { ...row.publicSnapshotJson, difficulty };
	await db
		.update(dailyPuzzles)
		.set({ difficulty, publicSnapshotJson })
		.where(eq(dailyPuzzles.id, row.id));

	return { ...row, difficulty, publicSnapshotJson };
}

// Fire-and-forget AI clue generation for a freshly created puzzle. Never blocks
// or fails puzzle creation: a missing API key or API error only means clues are
// absent (players fall back to letter hints).
function triggerCluesGeneration(
	puzzleId: string,
	wordSlots: DailyPuzzlePrivateWord[],
): void {
	if (cluesGenerationStarted.has(puzzleId)) return;
	cluesGenerationStarted.add(puzzleId);

	void generateAndStoreCluesForPuzzle({ puzzleId, wordSlots })
		.catch((error: unknown) => {
			console.error(
				`[puzzle-service] Clue generation failed for puzzle ${puzzleId}:`,
				error,
			);
			captureServerException(error, {
				properties: { puzzle_id: puzzleId, scope: "clue_generation" },
			});
		})
		.finally(() => {
			cluesGenerationStarted.delete(puzzleId);
		});
}

async function getDictionaryVersion() {
	if (!cachedDictionaryVersion) {
		cachedDictionaryVersion = hashText(
			JSON.stringify(
				serverWords.map((word) => ({
					name: word.name,
					areatematica: word.areatematica,
					frequency: word.frequency,
				})),
			),
		);
	}

	return cachedDictionaryVersion;
}

export function getDailyValidNormalizedGuesses(letters: string[]) {
	const cacheKey = [...letters].sort().join("");
	const cachedGuesses = validNormalizedGuessesCache.get(cacheKey);

	if (cachedGuesses) {
		return cachedGuesses;
	}

	const validGuesses = getValidNormalizedGuessesForLetters(
		normalizedServerWords,
		letters,
	);
	validNormalizedGuessesCache.set(cacheKey, validGuesses);
	return validGuesses;
}

export async function checkDailyPuzzleExists(
	dateKey = getTodayDateKey(),
): Promise<boolean> {
	const existing = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
		columns: { id: true },
	});
	return existing != null;
}

// Lightweight lookup for UI that only needs today's rating (leaderboard header).
// Does not generate a puzzle: if today's row isn't there yet, callers omit the
// indicator. The column is authoritative; the snapshot covers older rows.
export async function getDailyPuzzleDifficulty(
	dateKey = getTodayDateKey(),
): Promise<PuzzleDifficulty | null> {
	const existing = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
		columns: { difficulty: true, publicSnapshotJson: true },
	});
	if (!existing) {
		return null;
	}
	return toPuzzleDifficulty(
		existing.difficulty ?? existing.publicSnapshotJson.difficulty,
	);
}

// Reads a stored puzzle without ever creating one. Every request-driven path
// goes through this: generation is expensive (a placement search over the whole
// dictionary) and it spends Anthropic credits on clues, so it may not be
// reachable by naming a date in a request. See triggerDailyPuzzleGeneration for
// the one on-demand exception.
export async function readDailyPuzzleRow(dateKey = getTodayDateKey()) {
	const existing = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});

	return existing ? ensurePuzzleRowDifficulty(existing) : null;
}

export class DailyPuzzleNotFoundError extends Error {
	constructor(dateKey: string) {
		super(`No puzzle stored for ${dateKey}`);
		this.name = "DailyPuzzleNotFoundError";
	}
}

// On-demand generation, reachable from a page load. Restricted to today so a
// caller can't mint puzzles for arbitrary dates: tomorrow's is pre-generated by
// the pre-generator container an hour before rollover (see scripts/pre-generate.sh),
// past days are filled by the backfill script, and both call
// ensureDailyPuzzleSnapshot directly. Today is the only date a request may still
// need to bootstrap (a cold start, or a missed pre-generation), and generating it
// discloses nothing a player can't see.
export function triggerDailyPuzzleGeneration(
	dateKey = getTodayDateKey(),
): void {
	if (dateKey !== getTodayDateKey()) {
		console.warn(
			`[puzzle-service] Refusing on-demand generation for ${dateKey}: only today may be generated on demand`,
		);
		return;
	}

	if (inProgressGenerations.has(dateKey)) return;

	const promise = ensureDailyPuzzleSnapshot(dateKey)
		.then(() => {})
		.catch((err: unknown) => {
			console.error(
				`[puzzle-service] Puzzle generation failed for ${dateKey}:`,
				err,
			);
		})
		.finally(() => {
			inProgressGenerations.delete(dateKey);
		});

	inProgressGenerations.set(dateKey, promise);
}

export async function ensureDailyPuzzleSnapshot(dateKey = getTodayDateKey()) {
	const existing = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});

	if (existing) {
		return ensurePuzzleRowDifficulty(existing);
	}

	const seed = dateKeyToSeed(dateKey);
	const generated = generateDailyCrosswordForSeed(serverWords, seed);

	if (!generated) {
		throw new Error(`Failed to generate puzzle for ${dateKey}`);
	}

	const puzzleId = crypto.randomUUID();
	const { publicSnapshot, privateSnapshot } = await buildPuzzleSnapshots({
		puzzleId,
		dateKey,
		seed,
		crossword: generated.crossword,
		letters: generated.letters,
		initialShuffledLetters: generated.shuffledLetters,
		algorithmVersion: PUZZLE_ALGORITHM_VERSION,
		availableWordCount: getDailyValidNormalizedGuesses(generated.letters)
			.length,
	});

	const inserted = await db
		.insert(dailyPuzzles)
		.values({
			id: puzzleId,
			dateKey,
			seed,
			algorithmVersion: PUZZLE_ALGORITHM_VERSION,
			dictionaryVersion: await getDictionaryVersion(),
			wordCount: privateSnapshot.wordSlots.length,
			difficulty: publicSnapshot.difficulty ?? null,
			publicSnapshotJson: publicSnapshot,
			privateSnapshotJson: privateSnapshot,
		})
		.onConflictDoNothing({
			target: dailyPuzzles.dateKey,
		})
		.returning();

	if (inserted[0]) {
		captureServerEvent({
			event: "daily_puzzle_generated",
			properties: {
				date_key: dateKey,
				puzzle_id: inserted[0].id,
				seed,
				word_count: privateSnapshot.wordSlots.length,
			},
		});
		triggerCluesGeneration(inserted[0].id, privateSnapshot.wordSlots);
		return inserted[0];
	}

	const conflictRow = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});

	if (!conflictRow) {
		throw new Error(`Failed to persist puzzle for ${dateKey}`);
	}

	return ensurePuzzleRowDifficulty(conflictRow);
}
