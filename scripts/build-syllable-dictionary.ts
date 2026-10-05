import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { MINI_WORDS } from "../src/data/mini-words";
import { SYLLABLE_WORDS } from "../src/data/syllable-words";
import { createSyllableSplitter } from "./syllable-patterns";

// This is the pattern source linked by Softcatalà's syllable separator.
// Pin it so a fresh deployment cannot silently change the daily vocabulary.
// Patterns: Jaume Ortolà, GPL-3.0, https://github.com/jaumeortola/hyphen-ca
const SOURCE =
	"https://raw.githubusercontent.com/jaumeortola/hyphen-ca/dac10c01eab7132c1ddf4a22e2ea8a3f6ee439ae/ca.js";
const OUTPUT = "src/data/catalan-syllables.json";

async function main() {
	if (process.argv.includes("--if-missing") && existsSync(OUTPUT)) return;
	const response = await fetch(SOURCE);
	if (!response.ok)
		throw new Error(`Syllable patterns: HTTP ${response.status}`);
	const source = await response.text();
	// Read the pattern literals as data; never execute downloaded JavaScript.
	const patterns = z.array(z.string()).parse(JSON.parse(`[${source}]`));
	if (patterns.length < 100) throw new Error("Incomplete Catalan patterns");
	const split = createSyllableSplitter(patterns);
	const dictionary = z
		.array(z.string())
		.parse(
			JSON.parse(readFileSync("src/data/catalan-syllable-words.json", "utf8")),
		);
	const words = [
		...new Set([
			...dictionary,
			...MINI_WORDS,
			...SYLLABLE_WORDS.map((word) => word.join("")),
		]),
	];
	const curated = new Map(
		SYLLABLE_WORDS.map((syllables) => [syllables.join(""), syllables]),
	);
	const entries = words.map((word) => ({
		word,
		syllables: curated.get(word) ?? split(word),
	}));
	writeFileSync(OUTPUT, `${JSON.stringify(entries)}\n`);
	console.log(`Saved ${entries.length} syllabified words to ${OUTPUT}`);
}

main().catch((error) => {
	console.error("Failed to build syllable dictionary:", error);
	process.exitCode = 1;
});
