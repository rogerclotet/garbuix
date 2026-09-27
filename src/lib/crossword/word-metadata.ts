import type { Word } from "@/data/types";
import { getPlayableWordLetters, normalizeWord } from "@/lib/puzzle-text";
import type { SeededRandom } from "./seeded-random";

const WORD_PRIORITY_RANDOM_RANGE = 1.5;
// Two words are treated as sharing a root when their normalized common prefix
// covers at least this fraction of the shorter word (Catalan inflection is
// suffix-based: quedar/quedada, instància/instanciar).
const ROOT_PREFIX_RATIO = 0.8;
// Hard floor on the shared prefix so short coincidences (mare/marca) don't match.
const MIN_ROOT_PREFIX_LENGTH = 4;
export type WordLike = {
	name: string;
};

export type WordRuntimeMetadata = {
	word: WordLike;
	normalizedName: string;
	playableLetters: string[];
	cellCount: number;
	uniqueLetters: string[];
	uniqueLetterKey: string;
	isCrosswordCandidate: boolean;
	wordPriority: number;
};

const WORD_NAME_PATTERN = /^[a-záàéèíïóòúüç·]+$/i;
const wordRuntimeCache = new WeakMap<WordLike, WordRuntimeMetadata>();
function isDictionaryWord(word: WordLike): word is Word {
	return "frequency" in word && "areatematica" in word;
}

function getLengthPriority(normalizedLength: number): number {
	if (normalizedLength === 4) {
		return -0.2;
	}

	if (normalizedLength === 5) {
		return 0.05;
	}

	if (normalizedLength >= 6 && normalizedLength <= 8) {
		return 0.55;
	}

	if (normalizedLength <= 10) {
		return 0.65;
	}

	return 0.3;
}

export function getWordRuntimeMetadata(word: WordLike): WordRuntimeMetadata {
	const cached = wordRuntimeCache.get(word);
	if (cached) {
		return cached;
	}

	const normalizedName = normalizeWord(word.name);
	const playableLetters = getPlayableWordLetters(word.name);
	const uniqueLetters = [...new Set(normalizedName)].sort();
	const wordPriority = isDictionaryWord(word)
		? Math.log10((word.frequency ?? 0) + 10) +
			getLengthPriority(normalizedName.length) +
			(word.areatematica.includes("Nom")
				? 0.2
				: word.areatematica.includes("Adjectiu")
					? 0.15
					: word.areatematica.includes("Verb")
						? 0.1
						: 0.05)
		: 0;
	const metadata: WordRuntimeMetadata = {
		word,
		normalizedName,
		playableLetters,
		cellCount: playableLetters.length,
		uniqueLetters,
		uniqueLetterKey: uniqueLetters.join(""),
		isCrosswordCandidate:
			playableLetters.length >= 4 &&
			playableLetters.length <= 12 &&
			WORD_NAME_PATTERN.test(word.name),
		wordPriority,
	};

	wordRuntimeCache.set(word, metadata);
	return metadata;
}

function commonPrefixLength(left: string, right: string): number {
	const limit = Math.min(left.length, right.length);
	let length = 0;
	while (length < limit && left[length] === right[length]) {
		length++;
	}
	return length;
}

/**
 * Whether two words likely share a morphological root, judged by the length of
 * their normalized common prefix relative to the shorter word. Used to avoid
 * placing siblings such as `quedar`/`quedada` in the same puzzle.
 */
export function wordsShareRoot(left: WordLike, right: WordLike): boolean {
	const normalizedLeft = getWordRuntimeMetadata(left).normalizedName;
	const normalizedRight = getWordRuntimeMetadata(right).normalizedName;
	const shorter = Math.min(normalizedLeft.length, normalizedRight.length);
	const prefix = commonPrefixLength(normalizedLeft, normalizedRight);

	return (
		prefix >= MIN_ROOT_PREFIX_LENGTH &&
		prefix >= Math.ceil(ROOT_PREFIX_RATIO * shorter)
	);
}

/**
 * Count unordered pairs of words in a puzzle that share a root. Used both for
 * scoring candidate puzzles and in tests.
 */
export function countSameRootPairs(words: WordLike[]): number {
	let pairs = 0;
	for (let i = 0; i < words.length; i++) {
		for (let j = i + 1; j < words.length; j++) {
			if (wordsShareRoot(words[i], words[j])) {
				pairs++;
			}
		}
	}
	return pairs;
}

function compareWordsForSelection(left: Word, right: Word): number {
	const priorityDelta =
		getWordRuntimeMetadata(right).wordPriority -
		getWordRuntimeMetadata(left).wordPriority;
	if (priorityDelta !== 0) {
		return priorityDelta;
	}

	if (right.frequency !== left.frequency) {
		return right.frequency - left.frequency;
	}

	return left.name.localeCompare(right.name, "ca");
}

export function dedupeWordsByNormalizedForm(words: Word[]): Word[] {
	const bestWordByNormalizedForm = new Map<string, Word>();

	for (const word of words) {
		const normalized = getWordRuntimeMetadata(word).normalizedName;
		const existing = bestWordByNormalizedForm.get(normalized);
		if (!existing || compareWordsForSelection(word, existing) < 0) {
			bestWordByNormalizedForm.set(normalized, word);
		}
	}

	return [...bestWordByNormalizedForm.values()];
}

export function prioritizeWords(
	words: Word[],
	random: SeededRandom,
	wordPenalties?: Map<string, number>,
): Word[] {
	return words
		.map((word) => ({
			word,
			score:
				getWordRuntimeMetadata(word).wordPriority +
				random.next() * WORD_PRIORITY_RANDOM_RANGE +
				(wordPenalties?.get(getWordRuntimeMetadata(word).normalizedName) ?? 0),
		}))
		.sort((a, b) => b.score - a.score)
		.map(({ word }) => word);
}

export function getWordCells(word: WordLike): string[] {
	return getWordRuntimeMetadata(word).playableLetters;
}
