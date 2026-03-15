import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import {
	filterWordsByLetters,
	generateCrossword,
	generateDailyCrosswordForSeed,
	normalizeWord,
	SeededRandom,
} from "@/lib/crossword-generator";
import { dateKeyToSeed, getTodayDateKey } from "@/lib/puzzle-dates";

type DayAnalysis = {
	dateKey: string;
	letters: string[];
	letterSetKey: string;
	eligibleCount: number;
	selectedWords: string[];
	selectedWordSet: Set<string>;
};

type WordStats = {
	displayName: string;
	eligibleDays: number;
	selectedDays: number;
};

type LetterSetStats = {
	letters: string[];
	count: number;
	dates: string[];
	eligibleCounts: number[];
};

type ParsedArgs = {
	from: string;
	days: number;
	monteCarloRuns: number;
	top: number;
};

const words = allWords as Word[];
const DEFAULT_DAYS = 90;
const DEFAULT_MONTE_CARLO_RUNS = 500;
const DEFAULT_TOP = 10;

const IDEAL_FOUR_LETTER_RATIO = 0.35;
const IDEAL_SHORT_WORD_RATIO = 0.55;
const STRONG_DIVERSITY_SCORE = 46;
const MIN_GRID_COLS = 8;

type WordLengthProfile = {
	total: number;
	fourLetter: number;
	fiveLetter: number;
	short: number;
	medium: number;
	long: number;
	sevenPlus: number;
	fourLetterRatio: number;
	fiveLetterRatio: number;
	shortRatio: number;
	mediumRatio: number;
	longRatio: number;
	sevenPlusRatio: number;
	averageLength: number;
	uniqueLengths: number;
};

function getArg(flag: string) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseArgs(): ParsedArgs {
	const days = Number(getArg("--days") ?? DEFAULT_DAYS);
	const monteCarloRuns = Number(
		getArg("--monte-carlo-runs") ?? DEFAULT_MONTE_CARLO_RUNS,
	);
	const top = Number(getArg("--top") ?? DEFAULT_TOP);
	const from =
		getArg("--from") ?? addDays(getTodayDateKey("Europe/Madrid"), -(days - 1));

	if (!Number.isInteger(days) || days <= 0) {
		throw new Error("--days must be a positive integer");
	}

	if (!Number.isInteger(monteCarloRuns) || monteCarloRuns < 0) {
		throw new Error("--monte-carlo-runs must be a non-negative integer");
	}

	if (!Number.isInteger(top) || top <= 0) {
		throw new Error("--top must be a positive integer");
	}

	return {
		from,
		days,
		monteCarloRuns,
		top,
	};
}

function addDays(dateKey: string, days: number) {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function percent(value: number) {
	return `${(value * 100).toFixed(1)}%`;
}

function average(values: number[]) {
	return values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 0) {
		return 0;
	}
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

function intersectionSize(left: Set<string>, right: Set<string>) {
	let count = 0;
	for (const value of left) {
		if (right.has(value)) {
			count++;
		}
	}
	return count;
}

function getWordLengthProfile(wordNames: string[]): WordLengthProfile {
	const lengths = wordNames.map((word) => normalizeWord(word).length);
	const total = lengths.length;
	const fourLetter = lengths.filter((length) => length === 4).length;
	const fiveLetter = lengths.filter((length) => length === 5).length;
	const short = lengths.filter((length) => length <= 5).length;
	const medium = lengths.filter((length) => length >= 6 && length <= 8).length;
	const long = lengths.filter((length) => length >= 9).length;
	const sevenPlus = lengths.filter((length) => length >= 7).length;
	const averageLength =
		total === 0 ? 0 : lengths.reduce((sum, length) => sum + length, 0) / total;

	return {
		total,
		fourLetter,
		fiveLetter,
		short,
		medium,
		long,
		sevenPlus,
		fourLetterRatio: total === 0 ? 0 : fourLetter / total,
		fiveLetterRatio: total === 0 ? 0 : fiveLetter / total,
		shortRatio: total === 0 ? 0 : short / total,
		mediumRatio: total === 0 ? 0 : medium / total,
		longRatio: total === 0 ? 0 : long / total,
		sevenPlusRatio: total === 0 ? 0 : sevenPlus / total,
		averageLength,
		uniqueLengths: new Set(lengths).size,
	};
}

function scoreWordLengthProfile(profile: WordLengthProfile): number {
	if (profile.total === 0) {
		return Number.NEGATIVE_INFINITY;
	}

	const fourLetterPenalty =
		Math.max(0, profile.fourLetterRatio - IDEAL_FOUR_LETTER_RATIO) * 38;
	const shortPenalty =
		Math.max(0, profile.shortRatio - IDEAL_SHORT_WORD_RATIO) * 18;

	return (
		profile.averageLength * 4.5 +
		profile.mediumRatio * 13 +
		profile.sevenPlusRatio * 8 +
		profile.longRatio * 18 +
		Math.min(profile.uniqueLengths, 5) * 2 -
		fourLetterPenalty -
		shortPenalty
	);
}

function generateBestCrosswordForLetterSet(letters: string[], seed: number) {
	const filteredWords = filterWordsByLetters(words, letters);
	const random = new SeededRandom(seed);
	let bestWords: string[] | null = null;
	let bestScore = Number.NEGATIVE_INFINITY;
	let attempts = 0;

	while (attempts < 60) {
		try {
			const result = generateCrossword(filteredWords, 10, 15, random);
			if (result.words.length < 10 || result.cols < MIN_GRID_COLS) {
				attempts++;
				continue;
			}

			const usedLetters = new Set(
				result.words.flatMap((placement) =>
					normalizeWord(placement.word.name).split(""),
				),
			);

			if (!letters.every((letter) => usedLetters.has(letter))) {
				attempts++;
				continue;
			}

			const selectedWords = result.words.map((placement) => placement.word.name);
			const score = scoreWordLengthProfile(getWordLengthProfile(selectedWords));
			if (score > bestScore) {
				bestScore = score;
				bestWords = selectedWords;
			}

			if (score >= STRONG_DIVERSITY_SCORE) {
				break;
			}
		} catch (_error) {
			// Keep trying with the same seeded RNG stream.
		}

		attempts++;
	}

	return bestWords;
}

function analyzeDays(from: string, days: number) {
	const daily: DayAnalysis[] = [];
	const wordStats = new Map<string, WordStats>();
	const letterSetStats = new Map<string, LetterSetStats>();
	const letterFrequency = new Map<string, number>();
	const generationCache = new Map();
	const baselineCache = new Map();

	for (let offset = 0; offset < days; offset++) {
		const dateKey = addDays(from, offset);
		const seed = dateKeyToSeed(dateKey);
		const generated = generateDailyCrosswordForSeed(words, seed, 10, 15, {
			cache: generationCache,
			baselineCache,
		});

		if (!generated) {
			throw new Error(`Failed to generate puzzle for ${dateKey}`);
		}

		const letterSetKey = [...generated.letters].sort().join("");
		const eligibleWords = filterWordsByLetters(words, generated.letters);
		const selectedWords = generated.crossword.words.map(
			(placement) => placement.word.name,
		);
		const selectedWordSet = new Set(selectedWords.map(normalizeWord));

		daily.push({
			dateKey,
			letters: generated.letters,
			letterSetKey,
			eligibleCount: eligibleWords.length,
			selectedWords,
			selectedWordSet,
		});

		for (const letter of generated.letters) {
			letterFrequency.set(letter, (letterFrequency.get(letter) ?? 0) + 1);
		}

		const letterSetEntry = letterSetStats.get(letterSetKey) ?? {
			letters: [...generated.letters].sort(),
			count: 0,
			dates: [],
			eligibleCounts: [],
		};
		letterSetEntry.count++;
		letterSetEntry.dates.push(dateKey);
		letterSetEntry.eligibleCounts.push(eligibleWords.length);
		letterSetStats.set(letterSetKey, letterSetEntry);

		for (const word of eligibleWords) {
			const key = normalizeWord(word.name);
			const entry = wordStats.get(key) ?? {
				displayName: word.name,
				eligibleDays: 0,
				selectedDays: 0,
			};
			entry.eligibleDays++;
			wordStats.set(key, entry);
		}

		for (const word of selectedWords) {
			const key = normalizeWord(word);
			const entry = wordStats.get(key) ?? {
				displayName: word,
				eligibleDays: 0,
				selectedDays: 0,
			};
			entry.selectedDays++;
			wordStats.set(key, entry);
		}
	}

	return { daily, wordStats, letterSetStats, letterFrequency };
}

function printRangeSummary(
	from: string,
	days: number,
	top: number,
	analysis: ReturnType<typeof analyzeDays>,
) {
	const to = addDays(from, days - 1);
	const eligibleCounts = analysis.daily.map((day) => day.eligibleCount);
	const consecutiveLetterOverlap = analysis.daily
		.slice(1)
		.map((day, index) =>
			intersectionSize(
				new Set(analysis.daily[index].letters),
				new Set(day.letters),
			),
		);
	const totalSelectedPlacements = analysis.daily.reduce(
		(sum, day) => sum + day.selectedWords.length,
		0,
	);
	const totalEligibleWordDays = eligibleCounts.reduce(
		(sum, count) => sum + count,
		0,
	);
	const uniqueSelectedWords = new Set(
		analysis.daily.flatMap((day) => day.selectedWords.map(normalizeWord)),
	).size;
	const repeatedLetterSets = [...analysis.letterSetStats.values()]
		.filter((entry) => entry.count > 1)
		.sort((left, right) => right.count - left.count);
	const repeatedWords = [...analysis.wordStats.values()]
		.filter((entry) => entry.selectedDays > 1)
		.sort(
			(left, right) =>
				right.selectedDays - left.selectedDays ||
				right.eligibleDays - left.eligibleDays ||
				left.displayName.localeCompare(right.displayName),
		);
	const highLiftWords = [...analysis.wordStats.values()]
		.filter((entry) => entry.eligibleDays >= 3 && entry.selectedDays > 0)
		.sort((left, right) => {
			const leftRate = left.selectedDays / left.eligibleDays;
			const rightRate = right.selectedDays / right.eligibleDays;
			return (
				rightRate - leftRate ||
				right.selectedDays - left.selectedDays ||
				right.eligibleDays - left.eligibleDays
			);
		});
	const frequentEligibleWords = [...analysis.wordStats.values()]
		.filter((entry) => entry.eligibleDays >= 5)
		.sort((left, right) => {
			const leftRate = left.selectedDays / left.eligibleDays;
			const rightRate = right.selectedDays / right.eligibleDays;
			return (
				right.selectedDays - left.selectedDays ||
				rightRate - leftRate ||
				right.eligibleDays - left.eligibleDays
			);
		});
	const topLetters = [...analysis.letterFrequency.entries()].sort(
		(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
	);

	console.log(`Range: ${from} to ${to} (${days} days)`);
	console.log("");
	console.log("Letter sets");
	console.log(
		`- Unique 6-letter sets: ${analysis.letterSetStats.size}/${days} days`,
	);
	console.log(
		`- Repeated exact sets: ${repeatedLetterSets.length} (max repeat count: ${repeatedLetterSets[0]?.count ?? 1})`,
	);
	console.log(
		`- Eligible words per day: avg ${average(eligibleCounts).toFixed(1)}, median ${median(eligibleCounts).toFixed(1)}, min ${Math.min(...eligibleCounts)}, max ${Math.max(...eligibleCounts)}`,
	);
	console.log(
		`- Shared letters vs previous day: avg ${average(consecutiveLetterOverlap).toFixed(2)} of 6, max ${Math.max(...consecutiveLetterOverlap, 0)}`,
	);
	console.log(
		`- Most common letters in the daily six: ${topLetters
			.slice(0, top)
			.map(([letter, count]) => `${letter} (${count})`)
			.join(", ")}`,
	);

	if (repeatedLetterSets.length > 0) {
		console.log("");
		console.log("Top repeated letter sets");
		for (const entry of repeatedLetterSets.slice(0, top)) {
			console.log(
				`- ${entry.letters.join("")}: ${entry.count} times, eligible avg ${average(entry.eligibleCounts).toFixed(1)}, dates ${entry.dates.join(", ")}`,
			);
		}
	}

	console.log("");
	console.log("Selected words");
	console.log(
		`- Total selected word placements: ${totalSelectedPlacements} across ${days} puzzles`,
	);
	console.log(`- Unique selected words: ${uniqueSelectedWords}`);
	console.log(
		`- Repeated words: ${repeatedWords.length} unique words appeared on more than one day`,
	);
	console.log(
		`- Baseline per-eligible-word selection rate: ${percent(totalSelectedPlacements / totalEligibleWordDays)}`,
	);

	if (repeatedWords.length > 0) {
		console.log("");
		console.log("Most repeated selected words");
		for (const entry of repeatedWords.slice(0, top)) {
			console.log(
				`- ${entry.displayName}: selected ${entry.selectedDays} days, eligible ${entry.eligibleDays} days, selection rate ${percent(entry.selectedDays / entry.eligibleDays)}`,
			);
		}
	}

	if (frequentEligibleWords.length > 0) {
		console.log("");
		console.log("Frequent eligible words");
		for (const entry of frequentEligibleWords.slice(0, top)) {
			console.log(
				`- ${entry.displayName}: selected ${entry.selectedDays}/${entry.eligibleDays} eligible days (${percent(entry.selectedDays / entry.eligibleDays)})`,
			);
		}
	}

	if (highLiftWords.length > 0) {
		console.log("");
		console.log("Highest selection rate once eligible (min 3 eligible days)");
		for (const entry of highLiftWords.slice(0, top)) {
			console.log(
				`- ${entry.displayName}: selected ${entry.selectedDays}/${entry.eligibleDays} eligible days (${percent(entry.selectedDays / entry.eligibleDays)})`,
			);
		}
	}
}

function printMonteCarloSummary(
	analysis: ReturnType<typeof analyzeDays>,
	runs: number,
	top: number,
) {
	if (runs === 0) {
		return;
	}

	const candidates = [...analysis.letterSetStats.values()]
		.sort(
			(left, right) =>
				right.count - left.count ||
				average(right.eligibleCounts) - average(left.eligibleCounts),
		)
		.slice(0, Math.min(top, 3));

	console.log("");
	console.log(
		`Fixed-letter Monte Carlo (${runs} runs per letter set, production scoring/attempt logic)`,
	);

	for (const candidate of candidates) {
		const appearanceCounts = new Map<string, number>();
		const uniqueWordLists = new Map<string, number>();
		let successCount = 0;

		for (let run = 0; run < runs; run++) {
			const selectedWords = generateBestCrosswordForLetterSet(
				candidate.letters,
				900_000 + run,
			);

			if (!selectedWords) {
				continue;
			}

			successCount++;
			const normalizedWords = selectedWords
				.map((word) => normalizeWord(word))
				.sort();
			const key = normalizedWords.join(",");
			uniqueWordLists.set(key, (uniqueWordLists.get(key) ?? 0) + 1);

			for (const word of new Set(selectedWords.map(normalizeWord))) {
				appearanceCounts.set(word, (appearanceCounts.get(word) ?? 0) + 1);
			}
		}

		const eligibleWords = filterWordsByLetters(words, candidate.letters);
		const topWords = [...appearanceCounts.entries()]
			.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
			.slice(0, top)
			.map(([word, count]) => `${word} (${percent(count / successCount)})`);

		console.log(
			`- ${candidate.letters.join("")}: repeated ${candidate.count} times in range, ${eligibleWords.length} eligible words, ${uniqueWordLists.size} unique word-lists across ${successCount} successful runs`,
		);
		console.log(`  top recurring words: ${topWords.join(", ")}`);
	}
}

function main() {
	const args = parseArgs();
	const analysis = analyzeDays(args.from, args.days);
	printRangeSummary(args.from, args.days, args.top, analysis);
	printMonteCarloSummary(analysis, args.monteCarloRuns, args.top);
}

main();
