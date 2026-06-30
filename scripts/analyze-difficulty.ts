import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { generateDailyCrosswordForSeed } from "@/lib/crossword-generator";
import {
	difficultyFromMeanLogFrequency,
	meanLogFrequency,
	type PuzzleDifficulty,
} from "@/lib/puzzle-difficulty";
import {
	addDaysToDateKey,
	dateKeyToSeed,
	getTodayDateKey,
} from "@/lib/puzzle-dates";

// Simulates daily puzzle generation over a window and reports the resulting
// difficulty distribution, so we can confirm the 1-3 star split stays roughly
// even and re-tune the thresholds in src/lib/puzzle-difficulty.ts if it drifts.
// Uses the same metric as production: the mean log10 frequency of each puzzle's
// selected words.

const words = allWords as Word[];
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
	const counts: Record<PuzzleDifficulty, number> = { 1: 0, 2: 0, 3: 0 };
	const recent: Array<{ dateKey: string; mean: number; stars: PuzzleDifficulty }> =
		[];

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
		const stars = difficultyFromMeanLogFrequency(mean);
		means.push(mean);
		counts[stars] += 1;
		recent.push({ dateKey, mean, stars });
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
		"- p33/p66 are the empirical even-split thresholds; compare against the constants in src/lib/puzzle-difficulty.ts",
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
			`- ${day.dateKey}  mean ${day.mean.toFixed(3)}  ${"★".repeat(day.stars)}${"☆".repeat(3 - day.stars)}`,
		);
	}
}

main();
