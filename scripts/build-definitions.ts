import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { WordDefinitions } from "@/lib/word-definitions";
import {
	fetchCatalanLexicon,
	isGenerationCandidate,
} from "./lib/catalan-lexicon";

// Viccionari (ca.wiktionary.org) content is CC BY-SA 4.0. Old dumps are deleted
// after a few months, so the extracted file is committed instead of rebuilt
// on every build.
const DUMP_URL =
	"https://dumps.wikimedia.org/cawiktionary/latest/cawiktionary-latest-pages-articles.xml.bz2";
const OUTPUT_FILE = join(
	process.cwd(),
	"src",
	"data",
	"catalan-definitions.json",
);
const MAX_SENSES = 4;
const MAX_SENSE_LENGTH = 300;

// Senses that point at another entry or mark a missing definition. They say
// nothing about the meaning, so they never count as a definition.
const NON_DEFINITION_TEMPLATE =
	/\{\{\s*(ca-forma-conj|forma-[^|}]*|forma-conj|grafia|sense accepcions|manquen accepcions|falten accepcions)\s*[|}]/;
const LABEL_TEMPLATE = /\{\{\s*marca(?:-nocat)?\s*\|[^{}]*\}\}/g;
const SENSE_NUMBER = /\s*\[\d+\]/g;
const LINK_ONLY_SENSE = /^(?:\s*\[\[[^\]]+\]\][\s,;.]*)+$/;
const BARE_SYNONYM_TEMPLATE =
	/^\{\{\s*sinònim\s*\|\s*ca\s*\|\s*([^|}=]+)(?:\|[^}=]*)*\}\}[\s.]*$/;
const POS_HEADING = /^={3,4}\s*([^=]+?)\s*={3,4}\s*$/;
const LABELLED_SENSE = /^\s*\{\{\s*marca(?:-nocat)?\s*\|/;
const FEMININE_FORM_TEMPLATE =
	/^\{\{\s*forma-f\s*\|\s*ca\s*\|\s*([^|}]+)\}\}[\s.]*$/;

type RawSense = { partOfSpeech: string; text: string };
type RankedSense = { rank: "own" | "feminine" | "labelled"; text: string };

async function main() {
	console.log("📚 Loading Softcatalà candidates...");
	const candidates = (await fetchCatalanLexicon()).filter(
		isGenerationCandidate,
	);

	console.log(`📥 Streaming ${DUMP_URL}...`);
	const sensesByTitle = await readCatalanSenses();

	const definitions: WordDefinitions = {};
	for (const candidate of candidates) {
		const senses = buildSenses(candidate.name, sensesByTitle);
		if (senses.length > 0) {
			definitions[candidate.name] = senses;
		}
	}

	writeDefinitions(definitions);
	console.log(
		`✅ Saved definitions for ${Object.keys(definitions).length} of ${candidates.length} candidates to ${OUTPUT_FILE}`,
	);
}

main().catch((error) => {
	console.error("Failed to build definitions:", error);
	process.exitCode = 1;
});

// Node has no bzip2 decoder, so the dump goes through the system bzip2.
async function readCatalanSenses(): Promise<Map<string, RawSense[]>> {
	const response = await fetch(DUMP_URL);
	if (!response.ok || !response.body) {
		throw new Error(`Failed to fetch ${DUMP_URL}: ${response.status}`);
	}

	const bzip2 = spawn("bzip2", ["-dc"], { stdio: ["pipe", "pipe", "inherit"] });
	const exited = new Promise<void>((resolve, reject) => {
		bzip2.on("error", (error) =>
			reject(new Error(`Could not run bzip2: ${error.message}`)),
		);
		bzip2.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`bzip2 exited with code ${code}`)),
		);
	});
	Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(
		bzip2.stdin,
	);

	const sensesByTitle = new Map<string, RawSense[]>();
	let title = "";
	let inText = false;
	let inCatalan = false;
	let partOfSpeech = "";

	for await (const line of createInterface({ input: bzip2.stdout })) {
		const titleMatch = line.match(/^\s*<title>(.*)<\/title>\s*$/);
		if (titleMatch) {
			title = decodeXmlEntities(titleMatch[1]);
			continue;
		}
		if (!inText) {
			// Deleted or empty pages close the tag on the same line.
			if (!line.includes("<text") || /<text[^>]*\/>/.test(line)) continue;
			inText = true;
			inCatalan = false;
			partOfSpeech = "";
		}

		const content = line
			.replace(/^.*<text[^>]*>/, "")
			.replace(/<\/text>.*$/, "");
		if (/^==[^=].*==\s*$/.test(content)) {
			inCatalan = /^==\s*\{\{-ca-\}\}\s*==\s*$/.test(content);
		} else if (inCatalan) {
			const heading = content.match(POS_HEADING);
			if (heading) {
				partOfSpeech = heading[1].toLocaleLowerCase("ca");
			} else if (/^#[^:*#]/.test(content)) {
				const senses = sensesByTitle.get(title) ?? [];
				senses.push({
					partOfSpeech,
					text: decodeXmlEntities(content.slice(1)),
				});
				sensesByTitle.set(title, senses);
			}
		}

		if (line.includes("</text>")) {
			inText = false;
		}
	}

	await exited;
	return sensesByTitle;
}

// Clues are written about the first sense, so its order matters.
function buildSenses(
	word: string,
	sensesByTitle: Map<string, RawSense[]>,
): string[] {
	const senses: RankedSense[] = [];
	for (const sense of sensesByTitle.get(word) ?? []) {
		const raw = stripReferences(sense.text).replace(SENSE_NUMBER, "");
		const masculine = raw.trim().match(FEMININE_FORM_TEMPLATE)?.[1]?.trim();
		const text = masculine
			? describeFeminineForm(masculine, sense.partOfSpeech, sensesByTitle)
			: describeSense(word, raw, sensesByTitle);
		if (!text) continue;
		senses.push({
			rank: masculine
				? "feminine"
				: LABELLED_SENSE.test(raw)
					? "labelled"
					: "own",
			text: sense.partOfSpeech ? `(${sense.partOfSpeech}) ${text}` : text,
		});
	}
	// A word that is only the feminine of another is an inflection, not a
	// puzzle word of its own.
	if (senses.every((sense) => sense.rank === "feminine")) {
		return [];
	}
	return orderFeminineSenses(senses)
		.slice(0, MAX_SENSES)
		.map((sense) => sense.text);
}

// Viccionari's order is kept, with one exception: a page that opens with
// "femení de" (hamburguesa: femení de hamburguès) leads with its first
// unlabelled sense of its own (the burger) instead. Pages with only labelled
// senses beside the feminine (catalana: a Valencian porró, vídua: a fish)
// keep the masculine's meaning first.
function orderFeminineSenses(senses: RankedSense[]): RankedSense[] {
	const leadIndex = senses.findIndex((sense) => sense.rank === "own");
	if (senses[0]?.rank !== "feminine" || leadIndex === -1) {
		return senses;
	}
	return [
		senses[leadIndex],
		...senses.filter((_, index) => index !== leadIndex),
	];
}

// A sense that only names a synonym (balcar → [[embogar]]) can mislead the
// model, so it is replaced by the synonym's own first definition, or dropped
// when the synonym has none.
function describeSense(
	word: string,
	raw: string,
	sensesByTitle: Map<string, RawSense[]>,
): string | null {
	if (NON_DEFINITION_TEMPLATE.test(raw)) {
		return null;
	}

	const target = findSynonymTarget(raw);
	if (target === null) {
		return cleanWikitext(raw) || null;
	}
	if (target === word) {
		return null;
	}
	const targetDefinition = (sensesByTitle.get(target) ?? [])
		.map((sense) => stripReferences(sense.text).replace(SENSE_NUMBER, ""))
		.find(
			(text) =>
				!NON_DEFINITION_TEMPLATE.test(text) && findSynonymTarget(text) === null,
		);
	if (!targetDefinition) {
		return null;
	}
	return `${cleanWikitext(raw)}: ${cleanWikitext(targetDefinition)}`;
}

// "femení de vidu" becomes the meaning of vidu, in the same part of speech
// when it has one.
function describeFeminineForm(
	masculine: string,
	partOfSpeech: string,
	sensesByTitle: Map<string, RawSense[]>,
): string | null {
	const candidates = (sensesByTitle.get(masculine) ?? [])
		.map((sense) => ({
			partOfSpeech: sense.partOfSpeech,
			text: stripReferences(sense.text).replace(SENSE_NUMBER, ""),
		}))
		.filter(
			({ text }) =>
				!NON_DEFINITION_TEMPLATE.test(text) && findSynonymTarget(text) === null,
		);
	const definition =
		candidates.find((sense) => sense.partOfSpeech === partOfSpeech) ??
		candidates[0];
	if (!definition) {
		return null;
	}
	return `femení de ${masculine}: ${cleanWikitext(definition.text)}`;
}

function findSynonymTarget(raw: string): string | null {
	const unlabeled = raw.replace(LABEL_TEMPLATE, "").trim();
	const templateTarget = unlabeled.match(BARE_SYNONYM_TEMPLATE)?.[1];
	if (templateTarget) {
		return templateTarget.trim();
	}
	if (LINK_ONLY_SENSE.test(unlabeled)) {
		return unlabeled.match(/\[\[([^\]|#]+)/)?.[1]?.trim() ?? null;
	}
	return null;
}

function stripReferences(text: string): string {
	return text
		.replace(/<ref[^>]*\/>/g, "")
		.replace(/<ref[^>]*>.*?<\/ref>/g, "")
		.replace(/<!--.*?-->/g, "");
}

function cleanWikitext(text: string): string {
	let cleaned = text;
	// Expand innermost templates first so nested ones ({{marca|ca|{{m|ca|per}}}}) resolve.
	for (let previous = ""; previous !== cleaned; ) {
		previous = cleaned;
		cleaned = cleaned.replace(/\{\{([^{}]*)\}\}/g, (_, body: string) =>
			expandTemplate(body),
		);
	}
	const result = cleaned
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
		.replace(/\[https?:\/\/\S+\s([^\]]+)\]/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/'{2,}/g, "")
		.replace(/\(\s*\)/g, "")
		.replace(/\s+/g, " ")
		.replace(/\s+([,.;:])/g, "$1")
		.trim();
	return result.length > MAX_SENSE_LENGTH
		? `${result.slice(0, MAX_SENSE_LENGTH - 1).trimEnd()}…`
		: result;
}

function expandTemplate(body: string): string {
	const [rawName, ...params] = body.split("|");
	const name = rawName.trim();
	const positional = params
		.filter((param) => !/^[^=]+=/.test(param))
		.map((param) => param.trim())
		.filter(Boolean);
	const named = new Map(
		params
			.map((param) => param.match(/^([^=]+)=(.*)$/))
			.filter((match): match is RegExpMatchArray => match !== null)
			.map((match) => [match[1].trim(), match[2].trim()]),
	);
	const last = positional.at(-1) ?? "";

	switch (name) {
		case "marca":
		case "marca-nocat":
			return `(${positional.slice(1).join(", ")}) `;
		case "q":
			return `(${positional.join(", ")})`;
		case "sinònim": {
			const gloss = named.get("glossa");
			const synonyms = positional.slice(1).join(", ");
			return gloss ? `${synonyms} (${gloss})` : synonyms;
		}
		case "w":
		case "e":
		case "e-propi":
		case "m":
		case "l":
		case "terme":
		case "def-meta":
		case "IPAchar":
		case "romanes":
			return last;
		default:
			return "";
	}
}

function decodeXmlEntities(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&amp;/g, "&");
}

// One entry per line keeps diffs reviewable when the file is regenerated.
function writeDefinitions(definitions: WordDefinitions) {
	const lines = Object.keys(definitions)
		.sort((a, b) => a.localeCompare(b, "ca"))
		.map(
			(word) => `${JSON.stringify(word)}:${JSON.stringify(definitions[word])}`,
		);
	writeFileSync(OUTPUT_FILE, `{\n${lines.join(",\n")}\n}\n`);
}
