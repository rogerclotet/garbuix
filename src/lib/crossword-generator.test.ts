import { beforeAll, describe, expect, it } from "vitest";
import allWords from "@/data/catalan-words.json";
import {
	calculateCandidateFreshnessPenalty,
	computeViableLetterSets,
	countSameRootPairs,
	type DailyPuzzleHistoryEntry,
	generateDailyCrosswordForSeed,
	normalizeWord,
	SeededRandom,
	shuffleWordIds,
	toDailyPuzzleHistoryEntry,
	tryGenerateCrossword,
	wordsShareRoot,
} from "@/lib/crossword-generator";
import { getPlayableWordLetters } from "@/lib/puzzle-text";

type Crossword = NonNullable<
	ReturnType<typeof generateDailyCrosswordForSeed>
>["crossword"];

// Every cell lists exactly the words drawn through it.
function expectGridToMatchPlacements(crossword: Crossword) {
	const wordIdsByCell = new Map<string, number[]>();

	for (const placement of crossword.words) {
		const length = getPlayableWordLetters(placement.word.name).length;

		for (let index = 0; index < length; index += 1) {
			const row =
				placement.direction === "horizontal"
					? placement.startRow
					: placement.startRow + index;
			const col =
				placement.direction === "horizontal"
					? placement.startCol + index
					: placement.startCol;
			const cellKey = `${row},${col}`;
			wordIdsByCell.set(cellKey, [
				...(wordIdsByCell.get(cellKey) ?? []),
				placement.id,
			]);
		}
	}

	crossword.grid.forEach((cells, row) => {
		cells.forEach((cell, col) => {
			const expected = wordIdsByCell.get(`${row},${col}`) ?? [];
			expect([...(cell?.wordIds ?? [])].sort()).toEqual(expected.sort());
		});
	});
}

function getPangramWords(
	puzzle: NonNullable<ReturnType<typeof generateDailyCrosswordForSeed>>,
) {
	return puzzle.crossword.words.filter(
		(placement) =>
			new Set(normalizeWord(placement.word.name)).size ===
			puzzle.letters.length,
	);
}

function hasConflictingDisplayIntersections(
	result: NonNullable<ReturnType<typeof generateDailyCrosswordForSeed>>,
) {
	const lettersByCell = new Map<string, string>();

	for (const placement of result.crossword.words) {
		const letters = getPlayableWordLetters(placement.word.name);

		for (let index = 0; index < letters.length; index += 1) {
			const row =
				placement.direction === "horizontal"
					? placement.startRow
					: placement.startRow + index;
			const col =
				placement.direction === "horizontal"
					? placement.startCol + index
					: placement.startCol;
			const cellKey = `${row},${col}`;
			const existing = lettersByCell.get(cellKey);
			const letter = letters[index] ?? "";

			if (existing && existing !== letter) {
				return true;
			}

			lettersByCell.set(cellKey, letter);
		}
	}

	return false;
}

describe("wordsShareRoot", () => {
	it("flags morphological siblings", () => {
		const samples: [string, string][] = [
			["instància", "instanciar"],
			["quedar", "quedada"],
			["casa", "casar"],
		];

		for (const [left, right] of samples) {
			expect(wordsShareRoot({ name: left }, { name: right })).toBe(true);
		}
	});

	it("treats distinct roots as unrelated", () => {
		const samples: [string, string][] = [
			["mare", "marca"],
			["casa", "cosa"],
			["taula", "tauró"],
		];

		for (const [left, right] of samples) {
			expect(wordsShareRoot({ name: left }, { name: right })).toBe(false);
		}
	});

	it("counts unordered same-root pairs", () => {
		expect(
			countSameRootPairs([
				{ name: "quedar" },
				{ name: "quedada" },
				{ name: "taula" },
			]),
		).toBe(1);
		expect(countSameRootPairs([{ name: "mare" }, { name: "casa" }])).toBe(0);
	});
});

describe("crossword-generator freshness scoring", () => {
	it("returns no penalty when there is no recent history", () => {
		expect(
			calculateCandidateFreshnessPenalty(
				["a", "b", "c", "d", "e", "f"],
				["abcdef"],
				[],
			),
		).toBe(0);
	});

	it("heavily penalizes reusing the exact same letter set immediately", () => {
		const history: DailyPuzzleHistoryEntry[] = [
			{
				daysAgo: 1,
				letters: ["a", "b", "c", "d", "e", "f"],
				letterSetKey: "abcdef",
				selectedWordKeys: ["abcdef", "face"],
			},
		];

		const repeatedPenalty = calculateCandidateFreshnessPenalty(
			["f", "e", "d", "c", "b", "a"],
			["abcdef", "face"],
			history,
		);
		const freshPenalty = calculateCandidateFreshnessPenalty(
			["a", "b", "c", "g", "h", "i"],
			["abaci", "cabin"],
			history,
		);

		expect(repeatedPenalty).toBeGreaterThan(freshPenalty + 10);
	});

	it("increases the penalty for words that keep repeating across recent days", () => {
		const singleRepeatPenalty = calculateCandidateFreshnessPenalty(
			["a", "b", "c", "d", "e", "f"],
			["tenir", "sentir"],
			[
				{
					daysAgo: 2,
					letters: ["g", "h", "i", "j", "k", "l"],
					letterSetKey: "ghijkl",
					selectedWordKeys: ["tenir"],
				},
			],
		);

		const frequentRepeatPenalty = calculateCandidateFreshnessPenalty(
			["a", "b", "c", "d", "e", "f"],
			["tenir", "sentir"],
			[
				{
					daysAgo: 1,
					letters: ["g", "h", "i", "j", "k", "l"],
					letterSetKey: "ghijkl",
					selectedWordKeys: ["tenir"],
				},
				{
					daysAgo: 3,
					letters: ["m", "n", "o", "p", "q", "r"],
					letterSetKey: "mnopqr",
					selectedWordKeys: ["tenir", "sentir"],
				},
				{
					daysAgo: 5,
					letters: ["s", "t", "u", "v", "w", "x"],
					letterSetKey: "stuvwx",
					selectedWordKeys: ["tenir"],
				},
			],
		);

		expect(frequentRepeatPenalty).toBeGreaterThan(singleRepeatPenalty);
	});
});

describe("crossword layout", () => {
	const layoutWords = [
		"carretera",
		"terra",
		"carta",
		"recta",
		"tarta",
		"cera",
		"arca",
		"reca",
	].map((name) => ({ name, areatematica: "Nom", frequency: 1000 }));

	it.each(["horizontal", "vertical"] as const)(
		"starts from the first word placed %s",
		(direction) => {
			const crossword = tryGenerateCrossword(
				layoutWords,
				4,
				8,
				undefined,
				direction,
			);

			expect(crossword?.words[0]).toMatchObject({
				word: layoutWords[0],
				direction,
			});
			expectGridToMatchPlacements(crossword as Crossword);
		},
	);

	it("renumbers the words without changing where they sit", () => {
		const crossword = tryGenerateCrossword(layoutWords, 4, 8) as Crossword;
		const shuffled = shuffleWordIds(crossword, new SeededRandom(7));
		const byName = (words: Crossword["words"]) =>
			words
				.map(({ id: _id, ...placement }) => placement)
				.sort((a, b) => a.word.name.localeCompare(b.word.name));

		expect(shuffled.words.map((placement) => placement.id)).toEqual(
			crossword.words.map((_, index) => index),
		);
		expect(shuffled.words.map((placement) => placement.word.name)).not.toEqual(
			crossword.words.map((placement) => placement.word.name),
		);
		expect(byName(shuffled.words)).toEqual(byName(crossword.words));
		expectGridToMatchPlacements(shuffled);
	});
});

describe("viable letter sets", () => {
	it("offers sets of the requested size, six by default", () => {
		const sixLetterSets = computeViableLetterSets(allWords);
		const sevenLetterSets = computeViableLetterSets(allWords, 7);

		expect(sixLetterSets.length).toBeGreaterThan(0);
		expect(sevenLetterSets.length).toBeGreaterThan(0);
		expect(sixLetterSets.every((set) => set.letters.length === 6)).toBe(true);
		expect(sevenLetterSets.every((set) => set.letters.length === 7)).toBe(true);
		// Scans the whole dictionary twice with nothing cached yet, which takes
		// longer than the default five seconds on a busy CI runner.
	}, 30_000);
});

describe("generated daily puzzles", () => {
	type GeneratedPuzzle = NonNullable<
		ReturnType<typeof generateDailyCrosswordForSeed>
	>;
	let puzzles: GeneratedPuzzle[] = [];
	let sevenLetterPuzzle: GeneratedPuzzle;

	// With no stored history, generating a day also generates the days before
	// it. Those ranges overlap, so one shared cache pays for them once. Generating here in
	// a fixed order keeps each puzzle the same whichever tests are selected.
	beforeAll(() => {
		const cache = new Map();
		const generate = (
			seed: number,
			options: Parameters<typeof generateDailyCrosswordForSeed>[4],
		) => {
			const result = generateDailyCrosswordForSeed(
				allWords,
				seed,
				10,
				15,
				options,
			);
			if (!result) {
				throw new Error(`Expected crossword for seed ${seed}`);
			}
			return result;
		};

		const firstPuzzle = generate(260401, { cache });
		// The letter count only applies to the requested day, so a copy of the
		// history cached so far still holds and only the days after 2026-04-01
		// are generated again.
		sevenLetterPuzzle = generate(260405, {
			cache: new Map(cache),
			letterCount: 7,
		});
		puzzles = [
			firstPuzzle,
			...[260405, 260411].map((seed) => generate(seed, { cache })),
		];
	}, 120_000);

	it("uses six letters unless asked for another count", () => {
		for (const { letters } of puzzles) {
			expect(new Set(letters).size).toBe(6);
		}
	});

	it("builds a seven-letter puzzle when asked for one", () => {
		const { crossword, letters } = sevenLetterPuzzle;
		const placedLetters = new Set(
			crossword.words.flatMap((placement) => [
				...normalizeWord(placement.word.name),
			]),
		);

		expect(new Set(letters).size).toBe(7);
		expect([...placedLetters].sort()).toEqual([...letters].sort());
		expect(crossword.words.length).toBeGreaterThanOrEqual(10);
		expect(crossword.words.length).toBeLessThanOrEqual(15);
	});

	it("includes a word that uses every letter of the day", () => {
		for (const puzzle of [...puzzles, sevenLetterPuzzle]) {
			expect(getPangramWords(puzzle).length).toBeGreaterThan(0);
		}
	});

	it("keeps the grid consistent with the renumbered words", () => {
		for (const { crossword } of puzzles) {
			expect(crossword.words.map((placement) => placement.id)).toEqual(
				crossword.words.map((_, index) => index),
			);
			expectGridToMatchPlacements(crossword);
		}
	});

	it("builds on stored history instead of replaying earlier days", () => {
		const seed = 260420;
		const unrelatedHistory = [
			toDailyPuzzleHistoryEntry(1, ["q", "x", "z", "k", "w", "y"], []),
		];
		const cache = new Map();
		const first = generateDailyCrosswordForSeed(allWords, seed, 10, 15, {
			cache,
			storedHistory: unrelatedHistory,
		});
		if (!first) {
			throw new Error(`Expected crossword for seed ${seed}`);
		}

		// The seed fixes every random draw, so only the history can move the
		// second run away from the letters of the first.
		const second = generateDailyCrosswordForSeed(allWords, seed, 10, 15, {
			storedHistory: [
				...unrelatedHistory,
				toDailyPuzzleHistoryEntry(
					2,
					first.letters,
					first.crossword.words.map((placement) =>
						normalizeWord(placement.word.name),
					),
				),
			],
		});

		expect(cache.size).toBe(0);
		expect(getPangramWords(first).length).toBeGreaterThan(0);
		expect([...(second?.letters ?? [])].sort()).not.toEqual(
			[...first.letters].sort(),
		);
	});

	it("does not include duplicate normalized answers in the same daily puzzle", () => {
		for (const { crossword } of puzzles) {
			const normalizedWords = crossword.words.map((placement) =>
				normalizeWord(placement.word.name),
			);

			expect(new Set(normalizedWords).size).toBe(normalizedWords.length);
		}
	});

	it("does not place multiple words sharing a root in the same puzzle", () => {
		for (const { crossword } of puzzles) {
			const placedWords = crossword.words.map((placement) => placement.word);

			expect(countSameRootPairs(placedWords)).toBe(0);
			expect(placedWords.length).toBeGreaterThanOrEqual(10);
			expect(placedWords.length).toBeLessThanOrEqual(15);
		}
	});

	it("avoids crossings that disagree on the displayed accent for a shared cell", () => {
		for (const puzzle of puzzles) {
			expect(hasConflictingDisplayIntersections(puzzle)).toBe(false);
		}
	});
});
