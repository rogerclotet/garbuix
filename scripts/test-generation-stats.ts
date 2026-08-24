import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import {
	computeViableLetterSets,
	filterWordsByLetters,
	generateDailyCrosswordForSeed,
	normalizeWord,
} from "@/lib/crossword-generator";
import { dateKeyToSeed, getTodayDateKey } from "@/lib/puzzle-dates";

const words = allWords as Word[];
const DEFAULT_DAYS = 180;
const DEFAULT_TOP = 15;

type DayAnalysis = {
	dateKey: string;
	letters: string[];
	letterSetKey: string;
	eligibleCount: number;
	selectedWords: string[];
};

type ParsedArgs = {
	from: string;
	days: number;
	top: number;
};

type LetterSetEntry = {
	letters: string[];
	count: number;
	dates: string[];
};

type WordEntry = {
	displayName: string;
	eligibleDays: number;
	selectedDays: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getArg(flag: string) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function addDays(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function percent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function shannonEntropy(counts: number[]): number {
	const total = counts.reduce((sum, c) => sum + c, 0);
	if (total === 0) return 0;
	let entropy = 0;
	for (const count of counts) {
		if (count === 0) continue;
		const p = count / total;
		entropy -= p * Math.log2(p);
	}
	return entropy;
}

function average(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

function parseArgs(): ParsedArgs {
	const days = Number(getArg("--days") ?? DEFAULT_DAYS);
	const top = Number(getArg("--top") ?? DEFAULT_TOP);
	const from =
		getArg("--from") ?? addDays(getTodayDateKey("Europe/Madrid"), -(days - 1));

	if (!Number.isInteger(days) || days <= 0) {
		throw new Error("--days must be a positive integer");
	}

	if (!Number.isInteger(top) || top <= 0) {
		throw new Error("--top must be a positive integer");
	}

	return { from, days, top };
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

function collectDays(from: string, days: number) {
	const daily: DayAnalysis[] = [];
	const letterSetStats = new Map<string, LetterSetEntry>();
	const letterFrequency = new Map<string, number>();
	const wordStats = new Map<string, WordEntry>();
	const generationCache = new Map();

	for (let offset = 0; offset < days; offset++) {
		const dateKey = addDays(from, offset);
		const seed = dateKeyToSeed(dateKey);
		const generated = generateDailyCrosswordForSeed(words, seed, 10, 15, {
			cache: generationCache,
		});

		if (!generated) {
			throw new Error(`Failed to generate puzzle for ${dateKey}`);
		}

		const letterSetKey = [...generated.letters].sort().join("");
		const eligibleWords = filterWordsByLetters(words, generated.letters);
		const selectedWords = generated.crossword.words.map(
			(placement) => placement.word.name,
		);

		daily.push({
			dateKey,
			letters: generated.letters,
			letterSetKey,
			eligibleCount: eligibleWords.length,
			selectedWords,
		});

		// Letter frequency
		for (const letter of generated.letters) {
			letterFrequency.set(letter, (letterFrequency.get(letter) ?? 0) + 1);
		}

		// Letter set tracking
		const letterSetEntry = letterSetStats.get(letterSetKey) ?? {
			letters: [...generated.letters].sort(),
			count: 0,
			dates: [],
		};
		letterSetEntry.count++;
		letterSetEntry.dates.push(dateKey);
		letterSetStats.set(letterSetKey, letterSetEntry);

		// Word eligibility tracking
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

		// Word selection tracking
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

	return { daily, letterSetStats, letterFrequency, wordStats };
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

function printOverview(
	from: string,
	days: number,
	totalViableLetterSets: number,
) {
	const to = addDays(from, days - 1);
	console.log("=== Section 1: Overview ===");
	console.log(`Range: ${from} to ${to} (${days} days)`);
	console.log(
		`Total viable letter sets in dictionary: ${totalViableLetterSets}`,
	);
	console.log("");
}

function printLetterSetDiversity(
	days: number,
	letterSetStats: Map<string, LetterSetEntry>,
) {
	const uniqueSets = letterSetStats.size;
	const ratio = uniqueSets / days;
	const sorted = [...letterSetStats.values()].sort((a, b) => b.count - a.count);
	const maxRepeatEntry = sorted[0];
	const singleUseSets = sorted.filter((e) => e.count === 1).length;

	console.log("=== Section 2: Letter Set Diversity ===");
	console.log(`Unique 6-letter sets: ${uniqueSets} / ${days} days`);
	console.log(`Uniqueness ratio: ${percent(ratio)}`);
	console.log(
		`Max repeat count: ${maxRepeatEntry?.count ?? 0} (${maxRepeatEntry?.letters.join("") ?? "n/a"})`,
	);
	console.log(`Single-use sets: ${singleUseSets}`);

	const top5 = sorted.filter((e) => e.count > 1).slice(0, 5);
	if (top5.length > 0) {
		console.log("Top 5 most repeated sets:");
		for (const entry of top5) {
			console.log(
				`  ${entry.letters.join("")}: ${entry.count} times (${entry.dates.join(", ")})`,
			);
		}
	}
	console.log("");
}

function printLetterFrequency(
	days: number,
	letterFrequency: Map<string, number>,
) {
	const sorted = [...letterFrequency.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const counts = sorted.map(([, count]) => count);
	const entropy = shannonEntropy(counts);
	const maxEntropy = Math.log2(sorted.length);

	console.log("=== Section 3: Per-Letter Frequency Distribution ===");
	for (const [letter, count] of sorted) {
		console.log(`  ${letter}: ${count} (${percent(count / days)})`);
	}
	console.log(
		`Shannon entropy: ${entropy.toFixed(3)} bits (max ${maxEntropy.toFixed(3)} for ${sorted.length} letters)`,
	);
	console.log("");
}

function printConsecutiveDaySimilarity(daily: DayAnalysis[]) {
	const overlaps: number[] = [];
	for (let i = 1; i < daily.length; i++) {
		const prevSet = new Set(daily[i - 1].letters);
		let shared = 0;
		for (const letter of daily[i].letters) {
			if (prevSet.has(letter)) shared++;
		}
		overlaps.push(shared);
	}

	const nearDuplicates = overlaps.filter((o) => o >= 5).length;
	const exactDuplicates = overlaps.filter((o) => o >= 6).length;

	console.log("=== Section 4: Consecutive Day Similarity ===");
	console.log(
		`Average letters shared with previous day: ${average(overlaps).toFixed(2)} / 6`,
	);
	console.log(
		`Max letters shared with previous day: ${Math.max(...overlaps, 0)}`,
	);
	console.log(
		`Days with 5+ shared letters (near-duplicate): ${nearDuplicates}`,
	);
	console.log(
		`Days with 6 shared letters (exact duplicate): ${exactDuplicates}`,
	);
	console.log("");
}

function printRollingWindowAnalysis(daily: DayAnalysis[]) {
	console.log("=== Section 5: Rolling Window Analysis ===");

	for (const windowSize of [14, 28]) {
		if (daily.length < windowSize) {
			console.log(
				`  ${windowSize}-day window: not enough data (need ${windowSize} days, have ${daily.length})`,
			);
			continue;
		}

		const uniqueCounts: number[] = [];
		for (let start = 0; start <= daily.length - windowSize; start++) {
			const sets = new Set<string>();
			for (let j = start; j < start + windowSize; j++) {
				sets.add(daily[j].letterSetKey);
			}
			uniqueCounts.push(sets.size);
		}

		console.log(
			`  ${windowSize}-day window: min ${Math.min(...uniqueCounts)} / max ${Math.max(...uniqueCounts)} / avg ${average(uniqueCounts).toFixed(1)} unique letter sets`,
		);
	}
	console.log("");
}

function printWordRepetition(
	daily: DayAnalysis[],
	wordStats: Map<string, WordEntry>,
	top: number,
) {
	const totalPlacements = daily.reduce(
		(sum, day) => sum + day.selectedWords.length,
		0,
	);
	const uniqueSelected = new Set(
		daily.flatMap((day) => day.selectedWords.map(normalizeWord)),
	).size;
	const diversityRatio = uniqueSelected / totalPlacements;

	const repeatedWords = [...wordStats.values()]
		.filter((e) => e.selectedDays > 1)
		.sort(
			(a, b) =>
				b.selectedDays - a.selectedDays ||
				b.eligibleDays - a.eligibleDays ||
				a.displayName.localeCompare(b.displayName),
		);

	const alwaysSelected = [...wordStats.values()]
		.filter(
			(e) =>
				e.eligibleDays >= 3 &&
				e.selectedDays > 0 &&
				e.selectedDays === e.eligibleDays,
		)
		.sort(
			(a, b) =>
				b.selectedDays - a.selectedDays ||
				a.displayName.localeCompare(b.displayName),
		);

	console.log("=== Section 6: Word Repetition ===");
	console.log(`Total word placements: ${totalPlacements}`);
	console.log(`Unique words selected: ${uniqueSelected}`);
	console.log(`Word diversity ratio: ${percent(diversityRatio)}`);

	if (repeatedWords.length > 0) {
		console.log(`Most repeated words (top ${top}):`);
		for (const entry of repeatedWords.slice(0, top)) {
			const rate = entry.selectedDays / entry.eligibleDays;
			console.log(
				`  ${entry.displayName}: ${entry.selectedDays} days selected, ${entry.eligibleDays} days eligible, selection rate ${percent(rate)}`,
			);
		}
	}

	if (alwaysSelected.length > 0) {
		console.log(
			`Words with 100% selection rate (min 3 eligible days): ${alwaysSelected.length}`,
		);
		for (const entry of alwaysSelected.slice(0, top)) {
			console.log(
				`  ${entry.displayName}: ${entry.selectedDays}/${entry.eligibleDays} days`,
			);
		}
	}
	console.log("");
}

function printEligibleWordPool(daily: DayAnalysis[]) {
	const counts = daily.map((d) => d.eligibleCount);

	console.log("=== Section 7: Eligible Word Pool ===");
	console.log(`Average eligible words per day: ${average(counts).toFixed(1)}`);
	console.log(`Median eligible words per day: ${median(counts).toFixed(1)}`);
	console.log(`Min eligible words per day: ${Math.min(...counts)}`);
	console.log(`Max eligible words per day: ${Math.max(...counts)}`);
	console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
	const args = parseArgs();

	const viableLetterSets = computeViableLetterSets(words);
	const totalViableLetterSets = viableLetterSets.length;

	const { daily, letterSetStats, letterFrequency, wordStats } = collectDays(
		args.from,
		args.days,
	);

	printOverview(args.from, args.days, totalViableLetterSets);
	printLetterSetDiversity(args.days, letterSetStats);
	printLetterFrequency(args.days, letterFrequency);
	printConsecutiveDaySimilarity(daily);
	printRollingWindowAnalysis(daily);
	printWordRepetition(daily, wordStats, args.top);
	printEligibleWordPool(daily);
}

main();
