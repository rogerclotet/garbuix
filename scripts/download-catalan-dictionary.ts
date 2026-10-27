import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Word } from "@/data/types";
import type { WordDefinitions } from "@/lib/word-definitions";
import {
	countLetters,
	fetchCatalanLexicon,
	GENERATION_MIN_FREQUENCY,
	GUESS_MIN_FREQUENCY,
	isGenerationCandidate,
	LEXICON_VERSION,
	MAX_LENGTH,
	MIN_LENGTH,
	toWord,
} from "./lib/catalan-lexicon";

const DATA_DIR = join(process.cwd(), "src", "data");
const OUTPUT_FILE = join(DATA_DIR, "catalan-words.json");
const GUESS_OUTPUT_FILE = join(DATA_DIR, "catalan-guess-words.json");
const SYLLABLE_OUTPUT_FILE = join(DATA_DIR, "catalan-syllable-words.json");
const DEFINITIONS_FILE = join(DATA_DIR, "catalan-definitions.json");
// Records which source and rules built the files above, so --if-missing
// rebuilds lists left over from an older checkout.
const VERSION_FILE = join(DATA_DIR, "catalan-lexicon-version.txt");

const ONLY_IF_MISSING = process.argv.includes("--if-missing");

async function main() {
	const definitions = readDefinitions();

	if (
		ONLY_IF_MISSING &&
		existsSync(GUESS_OUTPUT_FILE) &&
		existsSync(SYLLABLE_OUTPUT_FILE) &&
		isLexiconVersionCurrent() &&
		isGenerationListCurrent(definitions)
	) {
		console.log(`📚 Using existing dictionaries at ${DATA_DIR}`);
		return;
	}

	console.log("📚 Downloading general Catalan dictionary from Softcatalà...");

	const entries = await fetchCatalanLexicon();

	// Every puzzle word needs a definition so its AI clue rests on the real meaning.
	const generationWords = entries
		.filter(
			(word) =>
				isGenerationCandidate(word) && Object.hasOwn(definitions, word.name),
		)
		.map(toWord);
	// Guesses only need the word names; metadata stays in the generation file.
	const guessWordNames = entries
		.filter((word) => countLetters(word.name) >= MIN_LENGTH)
		.map((word) => word.name);

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		OUTPUT_FILE,
		JSON.stringify(generationWords satisfies Word[], null, 2),
	);
	writeFileSync(
		GUESS_OUTPUT_FILE,
		JSON.stringify(guessWordNames satisfies string[], null, 2),
	);
	// Syllable extras also accept short words such as pa, mà, and all.
	writeFileSync(
		SYLLABLE_OUTPUT_FILE,
		JSON.stringify(entries.map((word) => word.name)),
	);
	writeFileSync(VERSION_FILE, `${LEXICON_VERSION}\n`);

	console.log(
		`✅ Saved ${generationWords.length} generation words to ${OUTPUT_FILE}`,
	);
	console.log(
		`✅ Saved ${guessWordNames.length} guess words to ${GUESS_OUTPUT_FILE}`,
	);
	console.log(
		`ℹ️ Generation filter: ${MIN_LENGTH}-${MAX_LENGTH} letters, frequency >= ${GENERATION_MIN_FREQUENCY}, noun, adjective, verb or adverb other than -ment, has a Viccionari definition`,
	);
	console.log(
		`ℹ️ Guess filter: ${MIN_LENGTH}-${MAX_LENGTH} letters, frequency >= ${GUESS_MIN_FREQUENCY}, headword, feminine singular or personal pronoun`,
	);
}

main().catch((error) => {
	console.error("Failed to build Catalan dictionary:", error);
	process.exitCode = 1;
});

function readDefinitions(): WordDefinitions {
	if (!existsSync(DEFINITIONS_FILE)) {
		throw new Error(
			`${DEFINITIONS_FILE} is missing. It is committed; run pnpm build-definitions to regenerate it.`,
		);
	}
	return JSON.parse(readFileSync(DEFINITIONS_FILE, "utf8")) as WordDefinitions;
}

function isLexiconVersionCurrent(): boolean {
	return (
		existsSync(VERSION_FILE) &&
		readFileSync(VERSION_FILE, "utf8").trim() === LEXICON_VERSION
	);
}

// A generation list built before the definitions changed would let undefined
// words into puzzles, so --if-missing also rebuilds a stale list.
function isGenerationListCurrent(definitions: WordDefinitions): boolean {
	if (!existsSync(OUTPUT_FILE)) {
		return false;
	}
	// The lexicon version covers the candidate rules; only definitions are left.
	const words = JSON.parse(readFileSync(OUTPUT_FILE, "utf8")) as Word[];
	return words.every((word) => Object.hasOwn(definitions, word.name));
}
