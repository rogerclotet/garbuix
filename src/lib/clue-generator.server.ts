import Anthropic from "@anthropic-ai/sdk";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { puzzleWordClues } from "@/db/schema";
import { db } from "@/lib/db";
import { captureServerException } from "@/lib/observability-server";
import { normalizeWord } from "@/lib/puzzle-text";
import type { DailyPuzzlePrivateWord } from "@/lib/puzzle-types";
import { getServerEnv } from "@/lib/server-env";

export const CLUE_MODEL_ID = "claude-sonnet-4-6";

export type GeneratedWordClue = {
	model: string;
	clue: string;
};

const CLUE_MAX_TOKENS = 150;

// Cap how long a single Anthropic request can stall before we abort and let the
// SDK retry. The default is 10 minutes, which lets one stuck request wedge a
// whole backfill run (batches are awaited sequentially).
const ANTHROPIC_REQUEST_TIMEOUT_MS = 60_000;
const ANTHROPIC_MAX_RETRIES = 2;

const SYSTEM_PROMPT = `Ets l'autor de pistes d'un joc de paraules en català (estil mots encreuats). Et donaré una paraula amagada i la seva categoria temàtica. Has d'escriure UNA pista en català que ajudi a endevinar-la.

Regles estrictes:
- Escriu sempre en català.
- NO escriguis mai la paraula amagada ni cap de les seves formes (plural, femení, diminutiu, verb conjugat, derivats) ni cap fragment evident d'aquesta.
- La pista ha de ser suggerent i interessant, però NO òbvia: no donis la resposta amb un sinònim directe ni amb una definició de diccionari massa transparent.
- No facis servir la longitud, el nombre de lletres ni la categoria literal com a pista.
- Una sola frase, sense cometes, sense dos punts i sense posar la paraula entre parèntesis.

Respon NOMÉS amb el text de la pista, res més.`;

const RETRY_REMINDER =
	"La pista anterior contenia la paraula amagada o una forma derivada seva. Torna a escriure una pista nova SENSE cap forma de la paraula.";

const wordCategoryByNormalizedName: Map<string, string> = new Map(
	(allWords as Word[]).map((word) => [
		normalizeWord(word.name),
		word.areatematica,
	]),
);

let cachedClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
	const apiKey = getServerEnv().ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("ANTHROPIC_API_KEY_MISSING");
	}
	if (!cachedClient) {
		cachedClient = new Anthropic({
			apiKey,
			timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
			maxRetries: ANTHROPIC_MAX_RETRIES,
		});
	}
	return cachedClient;
}

export function getWordCategory(displayWord: string): string {
	return wordCategoryByNormalizedName.get(normalizeWord(displayWord)) ?? "";
}

function buildUserPrompt(options: {
	displayWord: string;
	areatematica: string;
	extraInstruction?: string;
}): string {
	const lines = [`Paraula amagada: ${options.displayWord}`];
	if (options.areatematica) {
		lines.push(`Categoria temàtica: ${options.areatematica}`);
	}
	if (options.extraInstruction) {
		lines.push(options.extraInstruction);
	}
	return lines.join("\n");
}

async function callModel(options: {
	modelId: string;
	displayWord: string;
	areatematica: string;
	extraInstruction?: string;
}): Promise<string> {
	const message = await getAnthropicClient().messages.create({
		model: options.modelId,
		max_tokens: CLUE_MAX_TOKENS,
		system: [
			{
				type: "text",
				text: SYSTEM_PROMPT,
				cache_control: { type: "ephemeral" },
			},
		],
		messages: [
			{
				role: "user",
				content: buildUserPrompt({
					displayWord: options.displayWord,
					areatematica: options.areatematica,
					extraInstruction: options.extraInstruction,
				}),
			},
		],
	});

	return message.content
		.filter((block): block is Anthropic.TextBlock => block.type === "text")
		.map((block) => block.text)
		.join(" ")
		.trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns the original tokens of `clue` that reveal the hidden word — the word
// itself, an inflection (plural/feminine/diminutive/conjugation), or a clear
// truncation of it. Used to reject and, as a last resort, mask leaks.
function findLeakingTokens(clue: string, normalizedWord: string): string[] {
	if (!normalizedWord) {
		return [];
	}

	const tokens = clue.split(/[^\p{L}·]+/u).filter(Boolean);
	const leaks: string[] = [];

	for (const token of tokens) {
		const normalizedToken = normalizeWord(token);
		if (normalizedToken.length < 3) {
			continue;
		}

		const isInflectionOrMatch =
			normalizedToken === normalizedWord ||
			normalizedToken.startsWith(normalizedWord);
		const isTruncation =
			normalizedWord.length >= 5 &&
			normalizedToken.length >= 4 &&
			normalizedWord.startsWith(normalizedToken);

		if (isInflectionOrMatch || isTruncation) {
			leaks.push(token);
		}
	}

	return leaks;
}

function maskLeaks(clue: string, leakingTokens: string[]): string {
	let masked = clue;
	for (const token of leakingTokens) {
		masked = masked.replace(new RegExp(escapeRegExp(token), "gi"), "…");
	}
	return masked.replace(/\s{2,}/g, " ").trim();
}

async function generateClueForModel(options: {
	modelId: string;
	displayWord: string;
	normalizedWord: string;
	areatematica: string;
}): Promise<string> {
	let clue = await callModel({
		modelId: options.modelId,
		displayWord: options.displayWord,
		areatematica: options.areatematica,
	});

	if (findLeakingTokens(clue, options.normalizedWord).length > 0) {
		clue = await callModel({
			modelId: options.modelId,
			displayWord: options.displayWord,
			areatematica: options.areatematica,
			extraInstruction: RETRY_REMINDER,
		});
	}

	const leaks = findLeakingTokens(clue, options.normalizedWord);
	return leaks.length > 0 ? maskLeaks(clue, leaks) : clue;
}

export async function generateWordClue(options: {
	displayWord: string;
	normalizedWord: string;
	areatematica: string;
}): Promise<GeneratedWordClue> {
	const clue = await generateClueForModel({
		...options,
		modelId: CLUE_MODEL_ID,
	});

	return { model: CLUE_MODEL_ID, clue };
}

// Bound concurrency so a large puzzle doesn't fire dozens of parallel Anthropic
// requests at once and hit rate limits.
const CLUE_GENERATION_BATCH_SIZE = 4;

// Generates a clue for every word slot and stores it. Idempotent: the unique
// (puzzleId, wordId) index means re-runs skip already-stored clues. Per-word
// failures are logged and skipped so one bad word can't abort the rest.
export async function generateAndStoreCluesForPuzzle(options: {
	puzzleId: string;
	wordSlots: DailyPuzzlePrivateWord[];
}): Promise<void> {
	if (!getServerEnv().ANTHROPIC_API_KEY) {
		const error = new Error(
			"ANTHROPIC_API_KEY missing; skipping clue generation",
		);
		console.warn(`[clue-generator] ${error.message}`);
		captureServerException(error, {
			properties: { puzzle_id: options.puzzleId, scope: "clue_generation" },
		});
		return;
	}

	const totalWords = options.wordSlots.length;
	let completedWords = 0;

	for (
		let offset = 0;
		offset < totalWords;
		offset += CLUE_GENERATION_BATCH_SIZE
	) {
		const batch = options.wordSlots.slice(
			offset,
			offset + CLUE_GENERATION_BATCH_SIZE,
		);
		console.log(
			`[clue-generator] puzzle ${options.puzzleId}: batch ${
				offset / CLUE_GENERATION_BATCH_SIZE + 1
			} (words ${offset + 1}-${Math.min(offset + batch.length, totalWords)} of ${totalWords})`,
		);

		await Promise.all(
			batch.map(async (slot) => {
				try {
					const generated = await generateWordClue({
						displayWord: slot.displayWord,
						normalizedWord: slot.normalizedWord,
						areatematica: getWordCategory(slot.displayWord),
					});

					await db
						.insert(puzzleWordClues)
						.values({
							id: crypto.randomUUID(),
							puzzleId: options.puzzleId,
							wordId: slot.id,
							normalizedWord: slot.normalizedWord,
							sonnetModel: generated.model,
							sonnetClue: generated.clue,
						})
						.onConflictDoNothing({
							target: [puzzleWordClues.puzzleId, puzzleWordClues.wordId],
						});

					completedWords += 1;
					console.log(
						`[clue-generator] puzzle ${options.puzzleId}: stored clue for "${slot.displayWord}" (${completedWords}/${totalWords})`,
					);
				} catch (error) {
					console.error(
						`[clue-generator] Failed to generate/store clue for word ${slot.id} (${slot.displayWord}):`,
						error,
					);
					captureServerException(error, {
						properties: {
							puzzle_id: options.puzzleId,
							scope: "clue_generation",
							word_id: slot.id,
						},
					});
				}
			}),
		);
	}
}
