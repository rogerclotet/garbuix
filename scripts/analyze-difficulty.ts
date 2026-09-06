import guessWords from "@/data/catalan-guess-words.json";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { generateDailyCrosswordForSeed } from "@/lib/crossword-generator";
import {
	addDaysToDateKey,
	dateKeyToSeed,
	getTodayDateKey,
} from "@/lib/puzzle-dates";
import {
	buildNormalizedDictionary,
	getValidNormalizedGuessesForLetters,
} from "@/lib/puzzle-dictionary";
import {
	availableWordCountPenalty,
	difficultyFromScore,
	meanLogFrequency,
	type PuzzleDifficulty,
} from "@/lib/puzzle-difficulty";

// Simulates daily puzzle generation over a window and reports the resulting
// difficulty distribution and the effect of the valid-guess modifier.
// Uses the same score and guess dictionary as production.

const words = allWords as Word[];
const normalizedGuessWords = buildNormalizedDictionary(guessWords);
const DEFAULT_DAYS = 365;

function getArg(flag: string) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function quantile(sorted: number[], p: number) {
	if (sorted.length === 0) return 0;
	return sorted[Math.floor(p * (sorted.length - 1))];
}

const DIFFICULTY_LABELS: Record<PuzzleDifficulty, string> = {
	1: "easy  (★☆☆)",
	2: "medium(★★☆)",
	3: "hard  (★★★)",
};

function main() {
	const days = Number(getArg("--days") ?? DEFAULT_DAYS);
	if (!Number.isInteger(days) || days <= 0) {
		throw new Error("--days must be a positive integer");
	}

	const from =
		getArg("--from") ??
		addDaysToDateKey(getTodayDateKey("Europe/Madrid"), -(days - 1));

	const cache = new Map();
	const means: number[] = [];
	const scores: number[] = [];
	const availableWordCounts: number[] = [];
	let modifiedRatings = 0;
	const counts: Record<PuzzleDifficulty, number> = { 1: 0, 2: 0, 3: 0 };
	const recent: Array<{
		dateKey: string;
		mean: number;
		score: number;
		availableWordCount: number;
		stars: PuzzleDifficulty;
	}> = [];

	for (let offset = 0; offset < days; offset++) {
		const dateKey = addDaysToDateKey(from, offset);
		const generated = generateDailyCrosswordForSeed(
			words,
			dateKeyToSeed(dateKey),
			10,
			15,
			{ cache },
		);
		if (!generated) {
			throw new Error(`Failed to generate puzzle for ${dateKey}`);
		}

		const mean = meanLogFrequency(
			generated.crossword.words.map((placement) => placement.word.frequency),
		);
		const availableWordCount = getValidNormalizedGuessesForLetters(
			normalizedGuessWords,
			generated.letters,
		).length;
		const score = mean - availableWordCountPenalty(availableWordCount);
		const stars = difficultyFromScore(score);
		if (stars !== difficultyFromScore(mean)) modifiedRatings += 1;
		means.push(mean);
		scores.push(score);
		availableWordCounts.push(availableWordCount);
		counts[stars] += 1;
		recent.push({ dateKey, mean, score, availableWordCount, stars });
	}

	const to = addDaysToDateKey(from, days - 1);
	const sorted = [...means].sort((a, b) => a - b);
	const total = means.length;
	const pct = (count: number) => `${((100 * count) / total).toFixed(1)}%`;

	console.log(`Difficulty analysis: ${from} to ${to} (${days} days)`);
	console.log("");
	console.log("Mean log10(frequency) per puzzle:");
	console.log(
		`- min ${quantile(sorted, 0).toFixed(3)}, p33 ${quantile(sorted, 1 / 3).toFixed(3)}, median ${quantile(sorted, 0.5).toFixed(3)}, p66 ${quantile(sorted, 2 / 3).toFixed(3)}, max ${quantile(sorted, 1).toFixed(3)}`,
	);
	console.log(
		"- Frequency-only thresholds are preserved; the modifier can move borderline puzzles up one level.",
	);
	const sortedScores = [...scores].sort((a, b) => a - b);
	const sortedWordCounts = [...availableWordCounts].sort((a, b) => a - b);
	console.log(
		`Adjusted score: min ${quantile(sortedScores, 0).toFixed(3)}, p33 ${quantile(sortedScores, 1 / 3).toFixed(3)}, median ${quantile(sortedScores, 0.5).toFixed(3)}, p66 ${quantile(sortedScores, 2 / 3).toFixed(3)}, max ${quantile(sortedScores, 1).toFixed(3)}`,
	);
	console.log(
		`Valid guesses: min ${quantile(sortedWordCounts, 0)}, median ${quantile(sortedWordCounts, 0.5)}, max ${quantile(sortedWordCounts, 1)}`,
	);
	console.log(
		`Ratings raised by modifier: ${modifiedRatings} (${pct(modifiedRatings)})`,
	);
	console.log("");
	console.log("Star distribution (production thresholds):");
	for (const level of [1, 2, 3] as const) {
		console.log(
			`- ${DIFFICULTY_LABELS[level]}: ${counts[level]} days (${pct(counts[level])})`,
		);
	}

	console.log("");
	console.log("Most recent 14 days:");
	for (const day of recent.slice(-14)) {
		console.log(
			`- ${day.dateKey}  mean ${day.mean.toFixed(3)}  guesses ${day.availableWordCount}  score ${day.score.toFixed(3)}  ${"★".repeat(day.stars)}${"☆".repeat(3 - day.stars)}`,
		);
	}
}

main();
