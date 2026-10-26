import type { Word } from "@/data/types";

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 12;
// Generated puzzles only draw from words common enough to be recognizable and
// with a Viccionari definition for the AI clue. Guess validation accepts any
// word attested in the corpus, so the guess dictionary only requires 1.
export const GENERATION_MIN_FREQUENCY = 20;
export const GUESS_MIN_FREQUENCY = 1;

// Pinned so a new Softcatalà dictionary only reaches players through a commit
// here, never through an unrelated rebuild.
const SOURCE_COMMIT = "1c95123b972b264957d299ef206689bfaa6b98ce";
// Bump when the rules below change what counts as a word, so builds that keep
// generated files (--if-missing) rebuild them.
const POLICY_VERSION = 4;
export const LEXICON_VERSION = `${SOURCE_COMMIT}:${POLICY_VERSION}`;

const SOURCE_BASE_URL = `https://raw.githubusercontent.com/Softcatala/catalan-dict-tools/${SOURCE_COMMIT}`;
const DICTIONARY_PATH = "resultats/lt/diccionari.txt";
const LEMMA_FREQUENCIES_PATH = "frequencies/frequencies-dict-lemmas.txt";
const FORM_FREQUENCIES_PATH = "frequencies/frequencies-dict-forms.txt";

const VALID_WORD_REGEX = /^(?=.*[a-zà-ÿç])[a-zà-ÿç·]+$/u;
// Softcatalà numbers homograph lemmas, such as pau_1 and pau_2.
const HOMOGRAPH_SUFFIX = /_\d+$/;

// The first letter of a FreeLing tag is the part of speech. Interjections (I),
// abbreviations (Y) and punctuation (F) are left out on purpose. Order here is
// the order of the labels in areatematica.
const CATEGORY_LABELS = new Map<string, string>([
	["N", "Nom"],
	["A", "Adjectiu"],
	["V", "Verb"],
	["R", "Adverbi"],
	["D", "Determinant"],
	["P", "Pronom"],
	["S", "Preposició"],
	["C", "Conjunció"],
]);
const GENDERED_CATEGORIES = new Set(["N", "A", "D", "P"]);
// Closed-class words make poor crossword answers, so they are guess-only.
const GENERATION_CATEGORIES = new Set(["N", "A", "V", "R"]);

export type LexiconSources = {
	dictionary: string;
	lemmaFrequencies: string;
	formFrequencies: string;
};

type DictionaryLine = {
	form: string;
	lemma: string;
	tag: string;
};

// generationEligible marks the words a puzzle may use, subject to frequency,
// length and a definition. It is not written to the generated files.
export type LexiconWord = Word & { generationEligible: boolean };

type WordAccumulator = {
	name: string;
	frequency: number;
	labels: Set<string>;
	generationEligible: boolean;
};

// Every Softcatalà headword, feminine singular and personal pronoun with a
// corpus frequency of at least GUESS_MIN_FREQUENCY, sorted by descending
// frequency. Plurals and conjugated verb forms are left out.
export async function fetchCatalanLexicon(): Promise<LexiconWord[]> {
	const [dictionary, lemmaFrequencies, formFrequencies] = await Promise.all([
		fetchText(DICTIONARY_PATH),
		fetchText(LEMMA_FREQUENCIES_PATH),
		fetchText(FORM_FREQUENCIES_PATH),
	]);
	return buildCatalanLexicon({
		dictionary,
		lemmaFrequencies,
		formFrequencies,
	});
}

export function buildCatalanLexicon(sources: LexiconSources): LexiconWord[] {
	const lemmaFrequencies = parseFrequencyIndex(sources.lemmaFrequencies);
	const formFrequencies = parseFrequencyIndex(sources.formFrequencies);
	const words = new Map<string, WordAccumulator>();

	for (const rawLine of sources.dictionary.split(/\r?\n/)) {
		const line = parseDictionaryLine(rawLine);
		if (!line) {
			continue;
		}

		const label = CATEGORY_LABELS.get(line.tag.charAt(0));
		if (!label || !isValidWord(line.form) || !isWordForm(line)) {
			continue;
		}

		// The lemma index counts every inflection of a headword, which keeps
		// headwords whose bare form is rare. Other forms only have their own count.
		const formFrequency = formFrequencies.get(line.form) ?? 0;
		const frequency =
			line.form === line.lemma
				? Math.max(formFrequency, lemmaFrequencies.get(line.form) ?? 0)
				: formFrequency;
		if (frequency < GUESS_MIN_FREQUENCY) {
			continue;
		}

		const entry = words.get(line.form) ?? {
			name: line.form,
			frequency,
			labels: new Set<string>(),
			generationEligible: false,
		};
		entry.frequency = Math.max(entry.frequency, frequency);
		entry.labels.add(label);
		entry.generationEligible ||= isGenerationForm(line);
		words.set(line.form, entry);
	}

	return Array.from(words.values())
		.map(
			(entry): LexiconWord => ({
				name: entry.name,
				areatematica: formatLabels(entry.labels),
				frequency: entry.frequency,
				generationEligible: entry.generationEligible,
			}),
		)
		.sort(
			(a, b) => b.frequency - a.frequency || a.name.localeCompare(b.name, "ca"),
		);
}

// Puzzle candidates before the definition filter.
export function isGenerationCandidate(word: LexiconWord): boolean {
	return (
		word.generationEligible &&
		word.name.length >= MIN_LENGTH &&
		word.frequency >= GENERATION_MIN_FREQUENCY
	);
}

export function toWord({ name, areatematica, frequency }: LexiconWord): Word {
	return { name, areatematica, frequency };
}

async function fetchText(path: string): Promise<string> {
	const response = await fetch(`${SOURCE_BASE_URL}/${path}`);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${path}: ${response.status}`);
	}

	return response.text();
}

function parseFrequencyIndex(text: string): Map<string, number> {
	const frequencies = new Map<string, number>();

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}

		const separatorIndex = line.lastIndexOf(",");
		if (separatorIndex === -1) {
			continue;
		}

		const word = line.slice(0, separatorIndex).trim();
		const frequency = Number(line.slice(separatorIndex + 1).trim());
		if (!word || !Number.isFinite(frequency)) {
			continue;
		}

		frequencies.set(word.toLocaleLowerCase("ca"), frequency);
	}

	return frequencies;
}

// Lines are "form lemma tag", for example "pau pau_1 NCFS000".
function parseDictionaryLine(rawLine: string): DictionaryLine | null {
	const [form, lemma, tag] = rawLine.trim().split(/\s+/);
	if (!form || !lemma || !tag) {
		return null;
	}
	return { form, lemma: lemma.replace(HOMOGRAPH_SUFFIX, ""), tag };
}

// Headwords, plus the feminine singular a dictionary lists beside them
// (catalana, noia, aquesta) and the personal pronouns below.
function isWordForm({ form, lemma, tag }: DictionaryLine): boolean {
	if (tag.startsWith("NP")) {
		return false;
	}
	return (
		form === lemma ||
		isFeminineSingularTag(tag) ||
		isPersonalPronounHeadword(tag)
	);
}

// Softcatalà files every personal pronoun under jo, tu or ell, but mi, li and
// vostè are dictionary headwords, and so are nosaltres and vosaltres. Other
// plurals (ells, els, ens, vostès) are not. Tags read PP, person, gender,
// number, case: PP1CPN00 is nosaltres, the strong first person plural.
function isPersonalPronounHeadword(tag: string): boolean {
	if (!tag.startsWith("PP")) {
		return false;
	}
	const person = tag.charAt(2);
	const number = tag.charAt(4);
	const strong = tag.charAt(5) === "N";
	return number !== "P" || (strong && (person === "1" || person === "2"));
}

// Open-class headwords and their feminine singulars (noia, petita). A
// feminine's clue rests on the masculine's definition; see
// scripts/build-definitions.ts. -ment adverbs are long and would crowd out
// other words.
function isGenerationForm({ form, lemma, tag }: DictionaryLine): boolean {
	if (!GENERATION_CATEGORIES.has(tag.charAt(0))) {
		return false;
	}
	if (tag.startsWith("R") && form.endsWith("ment")) {
		return false;
	}
	return form === lemma || isFeminineSingularTag(tag);
}

// Gender and number follow the subtype in nouns (NCFS000) and one position
// later in adjectives, determiners and pronouns (AQ0FS0, DI0FS0, PI0FS000).
function isFeminineSingularTag(tag: string): boolean {
	const category = tag.charAt(0);
	if (!GENDERED_CATEGORIES.has(category)) {
		return false;
	}
	const genderIndex = category === "N" ? 2 : 3;
	return tag.charAt(genderIndex) === "F" && tag.charAt(genderIndex + 1) === "S";
}

function isValidWord(word: string): boolean {
	return (
		word.length <= MAX_LENGTH &&
		word === word.toLocaleLowerCase("ca") &&
		VALID_WORD_REGEX.test(word)
	);
}

function formatLabels(labels: Set<string>): string {
	const order = [...CATEGORY_LABELS.values()];
	return Array.from(labels)
		.sort((a, b) => order.indexOf(a) - order.indexOf(b))
		.join(" / ");
}
