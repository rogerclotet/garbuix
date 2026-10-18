import type { Word } from "@/data/types";
import { SeededRandom } from "@/lib/crossword/seeded-random";
import {
	dedupeWordsByNormalizedForm,
	getWordRuntimeMetadata,
	wordsShareRoot,
} from "@/lib/crossword/word-metadata";
import { getRecencyWeight } from "@/lib/crossword-generator";
import {
	connectionKey,
	findWordPaths,
	getPathConnectionKeys,
	QUADRAT_NEIGHBORS,
	summarizeQuadratPaths,
} from "@/lib/quadrat-board";
import {
	QUADRAT_CELL_COUNT,
	QUADRAT_MIN_WORD_LENGTH,
	QUADRAT_WORD_COUNT,
	type QuadratConnection,
} from "@/lib/quadrat-types";

export const QUADRAT_ALGORITHM_VERSION = "quadrat-v1";

// A run anneals one board this many steps. Measured on the generation
// dictionary, a run lands a valid board most of the time in about half a
// second; failed runs restart from new letters.
const ANNEAL_STEPS = 3000;
const MAX_RUNS = 24;
const START_TEMPERATURE = 2;
const END_TEMPERATURE = 0.05;
const LETTER_CHANGE_PROBABILITY = 0.7;
// Breaks ties between similar words differently every day.
const WORD_JITTER_RANGE = 1;
// Same weight the classic generator gives a word it used recently.
const WORD_FRESHNESS_PENALTY = 1.5;
const COVERED_CELL_BONUS = 1.5;
const MISSING_WORD_PENALTY = 8;
const SEED_SALT = 0x71756164;

type TrieNode = {
	children: Map<string, TrieNode>;
	// Index of the dictionary entry that ends here.
	entry: number | null;
};

type DictionaryEntry = {
	word: Word;
	normalized: string;
	priority: number;
};

type QuadratDictionary = {
	entries: DictionaryEntry[];
	trie: TrieNode;
	letterWeights: Array<[string, number]>;
	letterWeightTotal: number;
};

export type QuadratHistoryEntry = {
	daysAgo: number;
	normalizedWords: string[];
};

export type GeneratedQuadratWord = {
	id: number;
	word: Word;
	normalizedWord: string;
	path: number[];
};

export type GeneratedQuadrat = {
	letters: string[];
	words: GeneratedQuadratWord[];
	cellUses: number[];
	connections: QuadratConnection[];
};

type FoundWord = { count: number; path: number[] };

type BoardEvaluation = {
	score: number;
	valid: boolean;
	selected: Array<{ entry: number; path: number[] }>;
};

let cachedDictionary: { words: Word[]; dictionary: QuadratDictionary } | null =
	null;

function createTrieNode(): TrieNode {
	return { children: new Map(), entry: null };
}

function insertIntoTrie(root: TrieNode, word: string, entry: number) {
	let node = root;
	for (const letter of word) {
		let next = node.children.get(letter);
		if (!next) {
			next = createTrieNode();
			node.children.set(letter, next);
		}
		node = next;
	}
	node.entry = entry;
}

function getQuadratDictionary(words: Word[]): QuadratDictionary {
	if (cachedDictionary?.words === words) return cachedDictionary.dictionary;

	const entries = dedupeWordsByNormalizedForm(
		words.filter((word) => {
			const metadata = getWordRuntimeMetadata(word);
			return (
				metadata.isCrosswordCandidate &&
				metadata.normalizedName.length >= QUADRAT_MIN_WORD_LENGTH &&
				metadata.normalizedName.length <= QUADRAT_CELL_COUNT
			);
		}),
	).map((word) => {
		const metadata = getWordRuntimeMetadata(word);
		return {
			word,
			normalized: metadata.normalizedName,
			priority: metadata.wordPriority,
		};
	});

	const trie = createTrieNode();
	const letterCounts = new Map<string, number>();
	entries.forEach((entry, index) => {
		insertIntoTrie(trie, entry.normalized, index);
		for (const letter of entry.normalized) {
			letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + 1);
		}
	});
	const letterWeights = [...letterCounts].sort(([left], [right]) =>
		left.localeCompare(right),
	);
	const dictionary: QuadratDictionary = {
		entries,
		trie,
		letterWeights,
		letterWeightTotal: letterWeights.reduce((sum, [, count]) => sum + count, 0),
	};
	cachedDictionary = { words, dictionary };
	return dictionary;
}

// Walks every path on the board through the trie, counting the paths that
// spell each word.
function findWordsOnBoard(
	letters: readonly string[],
	trie: TrieNode,
): Map<number, FoundWord> {
	const found = new Map<number, FoundWord>();
	const path: number[] = [];
	const used = new Array<boolean>(QUADRAT_CELL_COUNT).fill(false);

	const visit = (cell: number, parent: TrieNode) => {
		const node = parent.children.get(letters[cell] ?? "");
		if (!node) return;
		used[cell] = true;
		path.push(cell);
		if (node.entry !== null) {
			const existing = found.get(node.entry);
			if (existing) existing.count++;
			else found.set(node.entry, { count: 1, path: [...path] });
		}
		for (const next of QUADRAT_NEIGHBORS[cell] ?? []) {
			if (!used[next]) visit(next, node);
		}
		path.pop();
		used[cell] = false;
	};

	for (let cell = 0; cell < QUADRAT_CELL_COUNT; cell++) visit(cell, trie);
	return found;
}

function computeWordScores(
	dictionary: QuadratDictionary,
	random: SeededRandom,
	recentHistory: QuadratHistoryEntry[],
): Float64Array {
	const penalties = new Map<string, number>();
	for (const entry of recentHistory) {
		const weight = getRecencyWeight(entry.daysAgo);
		if (weight <= 0) continue;
		for (const word of entry.normalizedWords) {
			penalties.set(
				word,
				(penalties.get(word) ?? 0) + weight * WORD_FRESHNESS_PENALTY,
			);
		}
	}

	const scores = new Float64Array(dictionary.entries.length);
	dictionary.entries.forEach((entry, index) => {
		scores[index] =
			entry.priority +
			random.next() * WORD_JITTER_RANGE -
			(penalties.get(entry.normalized) ?? 0);
	});
	return scores;
}

// Picks the best-scoring words that trace a single path, skipping any that
// share a root with one already picked.
function evaluateBoard(
	letters: readonly string[],
	dictionary: QuadratDictionary,
	scores: Float64Array,
): BoardEvaluation {
	const candidates = [...findWordsOnBoard(letters, dictionary.trie)]
		.filter(([, found]) => found.count === 1)
		.map(([entry, found]) => ({ entry, path: found.path }))
		.sort((left, right) => scores[right.entry] - scores[left.entry]);

	const selected: BoardEvaluation["selected"] = [];
	for (const candidate of candidates) {
		if (selected.length === QUADRAT_WORD_COUNT) break;
		const word = dictionary.entries[candidate.entry]?.word;
		if (
			!word ||
			selected.some(({ entry }) => {
				const other = dictionary.entries[entry]?.word;
				return other !== undefined && wordsShareRoot(word, other);
			})
		) {
			continue;
		}
		selected.push(candidate);
	}

	const covered = new Set(selected.flatMap(({ path }) => path)).size;
	const score =
		selected.reduce((sum, { entry }) => sum + scores[entry], 0) +
		covered * COVERED_CELL_BONUS -
		(QUADRAT_WORD_COUNT - selected.length) * MISSING_WORD_PENALTY;

	return {
		score,
		selected,
		valid:
			selected.length === QUADRAT_WORD_COUNT && covered === QUADRAT_CELL_COUNT,
	};
}

function pickLetter(dictionary: QuadratDictionary, random: SeededRandom) {
	let remaining = random.next() * dictionary.letterWeightTotal;
	for (const [letter, weight] of dictionary.letterWeights) {
		remaining -= weight;
		if (remaining <= 0) return letter;
	}
	return dictionary.letterWeights.at(-1)?.[0] ?? "a";
}

function mutateBoard(
	letters: readonly string[],
	dictionary: QuadratDictionary,
	random: SeededRandom,
): string[] {
	const next = [...letters];
	const cell = Math.floor(random.next() * QUADRAT_CELL_COUNT);
	if (random.next() < LETTER_CHANGE_PROBABILITY) {
		next[cell] = pickLetter(dictionary, random);
		return next;
	}
	const other = Math.floor(random.next() * QUADRAT_CELL_COUNT);
	[next[cell], next[other]] = [next[other] as string, next[cell] as string];
	return next;
}

function annealBoard(
	dictionary: QuadratDictionary,
	scores: Float64Array,
	random: SeededRandom,
): { letters: string[]; evaluation: BoardEvaluation } | null {
	let letters = Array.from({ length: QUADRAT_CELL_COUNT }, () =>
		pickLetter(dictionary, random),
	);
	let current = evaluateBoard(letters, dictionary, scores);
	let best = current.valid ? { letters, evaluation: current } : null;

	for (let step = 0; step < ANNEAL_STEPS; step++) {
		const temperature =
			START_TEMPERATURE +
			(END_TEMPERATURE - START_TEMPERATURE) * (step / ANNEAL_STEPS);
		const candidateLetters = mutateBoard(letters, dictionary, random);
		const candidate = evaluateBoard(candidateLetters, dictionary, scores);
		const accept =
			candidate.score >= current.score ||
			random.next() < Math.exp((candidate.score - current.score) / temperature);
		if (!accept) continue;
		letters = candidateLetters;
		current = candidate;
		if (current.valid && current.score > (best?.evaluation.score ?? -Infinity))
			best = { letters, evaluation: current };
	}

	return best;
}

// A 4x4 board holding fifteen common words. Each word traces exactly one path,
// so the path a player drags is always the one whose counts go down, and
// together they use every cell.
export function generateQuadratPuzzle(
	words: Word[],
	seed: number,
	options: { recentHistory?: QuadratHistoryEntry[] } = {},
): GeneratedQuadrat {
	const dictionary = getQuadratDictionary(words);
	const random = new SeededRandom(seed ^ SEED_SALT);
	const scores = computeWordScores(
		dictionary,
		random,
		options.recentHistory ?? [],
	);

	for (let run = 0; run < MAX_RUNS; run++) {
		const result = annealBoard(dictionary, scores, random);
		if (!result) continue;

		const ids = random.shuffleArray(
			Array.from({ length: QUADRAT_WORD_COUNT }, (_, index) => index),
		);
		const generatedWords = result.evaluation.selected.map(
			({ entry, path }, index) => {
				const { word, normalized } = dictionary.entries[
					entry
				] as DictionaryEntry;
				return {
					id: ids[index] as number,
					word,
					normalizedWord: normalized,
					path,
				};
			},
		);
		return {
			letters: result.letters,
			words: generatedWords.sort((left, right) => left.id - right.id),
			...summarizeQuadratPaths(generatedWords.map(({ path }) => path)),
		};
	}

	throw new Error(`Could not generate a Quadrat board for seed ${seed}`);
}

function countLetters(letters: Iterable<string>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const letter of letters)
		counts.set(letter, (counts.get(letter) ?? 0) + 1);
	return counts;
}

// Dictionary words a player can drag along the board's connections, minus the
// day's words. normalizedWords must already be normalized. A letter count
// check rules out almost every word before any path search, so this needs no
// trie of the whole guess dictionary in memory.
export function findQuadratValidGuesses(options: {
	letters: readonly string[];
	connections: readonly QuadratConnection[];
	normalizedWords: readonly string[];
	targetWords: readonly string[];
}): string[] {
	const connectionKeys = new Set(
		options.connections.map(({ cells: [left, right] }) =>
			connectionKey(left, right),
		),
	);
	const boardCounts = countLetters(options.letters);
	const targets = new Set(options.targetWords);
	const isOnBoard = (word: string) => {
		for (const [letter, count] of countLetters(word)) {
			if ((boardCounts.get(letter) ?? 0) < count) return false;
		}
		return true;
	};

	return [...new Set(options.normalizedWords)]
		.filter(
			(word) =>
				word.length >= QUADRAT_MIN_WORD_LENGTH &&
				word.length <= QUADRAT_CELL_COUNT &&
				!targets.has(word) &&
				isOnBoard(word) &&
				findWordPaths(options.letters, word).some((path) =>
					getPathConnectionKeys(path).every((key) => connectionKeys.has(key)),
				),
		)
		.sort();
}
