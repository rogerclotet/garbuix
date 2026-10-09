import type { Word } from "@/data/types";

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 12;
// Generated puzzles only draw from words common enough to be recognizable and
// with a Viccionari definition for the AI clue. Guess validation accepts any
// word attested in the corpus, so the guess dictionary only requires 1.
export const GENERATION_MIN_FREQUENCY = 20;
export const GUESS_MIN_FREQUENCY = 1;

const SOURCE_BASE_URL =
	"https://raw.githubusercontent.com/Softcatala/catalan-dict-tools/master";
const VALID_WORD_REGEX = /^(?=.*[a-zà-ÿç])[a-zà-ÿç·]+$/u;

const SOURCES = [
	{
		label: "Nom",
		path: "diccionari-arrel/noms-fdic.txt",
		type: "fdic",
	},
	{
		label: "Adjectiu",
		path: "diccionari-arrel/adjectius-fdic.txt",
		type: "fdic",
	},
	{
		label: "Verb",
		path: "diccionari-arrel/verbs-fdic.txt",
		type: "fdic",
	},
	{
		label: "Adverbi",
		path: "diccionari-arrel/adverbis-lt.txt",
		type: "lt",
	},
] as const;

type Source = (typeof SOURCES)[number];

type WordAccumulator = {
	name: string;
	frequency: number;
	labels: Set<string>;
};

// Every Softcatalà headword with a corpus frequency of at least
// GUESS_MIN_FREQUENCY, sorted by descending frequency.
export async function fetchCatalanLexicon(): Promise<Word[]> {
	const [frequencyText, ...sourceTexts] = await Promise.all([
		fetchText("frequencies/frequencies-dict-lemmas.txt"),
		...SOURCES.map((source) => fetchText(source.path)),
	]);

	const frequencies = parseFrequencyIndex(frequencyText);
	const words = new Map<string, WordAccumulator>();

	for (const [index, source] of SOURCES.entries()) {
		const text = sourceTexts[index];

		for (const rawLine of text.split(/\r?\n/)) {
			for (const form of extractForms(rawLine, source)) {
				if (!isSourceWordLowercase(form)) {
					continue;
				}

				const name = normalizeWord(form);

				if (!isValidWord(name)) {
					continue;
				}

				const frequency = frequencies.get(name) ?? 0;
				if (frequency < GUESS_MIN_FREQUENCY) {
					continue;
				}

				const entry = words.get(name) ?? {
					name,
					frequency,
					labels: new Set<string>(),
				};

				entry.frequency = Math.max(entry.frequency, frequency);
				entry.labels.add(source.label);
				words.set(name, entry);
			}
		}
	}

	return Array.from(words.values())
		.map(
			(entry): Word => ({
				name: entry.name,
				areatematica: formatLabels(entry.labels),
				frequency: entry.frequency,
			}),
		)
		.sort(
			(a, b) => b.frequency - a.frequency || a.name.localeCompare(b.name, "ca"),
		);
}

// Puzzle candidates before the definition filter.
export function isGenerationCandidate(word: Word): boolean {
	return (
		word.name.length >= MIN_LENGTH && word.frequency >= GENERATION_MIN_FREQUENCY
	);
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

		frequencies.set(normalizeWord(word), frequency);
	}

	return frequencies;
}

function extractForms(line: string, source: Source): string[] {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#")) {
		return [];
	}

	if (source.type === "lt") {
		const form = trimmed.split(/\s+/)[0];
		return form ? [form] : [];
	}

	const head = trimmed
		.split("=", 1)[0]
		.replace(/\[[^\]]*]/g, " ")
		.trim();

	return head ? head.split(/\s+/).filter(Boolean) : [];
}

function normalizeWord(word: string): string {
	return word.toLocaleLowerCase("ca");
}

function isSourceWordLowercase(word: string): boolean {
	return word === word.toLocaleLowerCase("ca");
}

function isValidWord(word: string): boolean {
	return (
		word.length >= 1 && word.length <= MAX_LENGTH && VALID_WORD_REGEX.test(word)
	);
}

function formatLabels(labels: Set<string>): string {
	const order = new Map<string, number>(
		SOURCES.map((source, index) => [source.label, index]),
	);

	return Array.from(labels)
		.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
		.join(" / ");
}
