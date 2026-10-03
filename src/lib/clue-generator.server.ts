import Anthropic from "@anthropic-ai/sdk";
import { captureException } from "@sentry/tanstackstart-react";
import allWords from "@/data/catalan-words.json";
import type { Word } from "@/data/types";
import { puzzleWordClues } from "@/db/schema";
import { findLeakingTokens } from "@/lib/clue-fairness";
import {
	CLUE_MODEL_ID,
	type ClueUsage,
	readClueUsage,
} from "@/lib/clue-generation-usage";
import { db } from "@/lib/db";
import { normalizeWord } from "@/lib/puzzle-text";
import type { DailyPuzzlePrivateWord } from "@/lib/puzzle-types";
import { getServerEnv } from "@/lib/server-env";

export { CLUE_MODEL_ID } from "@/lib/clue-generation-usage";

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

const SYSTEM_PROMPT = `Ets l'autor de pistes per a un joc de paraules en català (estil mots encreuats). Et donaré una paraula amagada i la seva categoria temàtica. Has d'escriure UNA pista curta en català que orienti cap a la paraula sense revelar-la.

Regles estrictes:
- Escriu sempre en català.
- NO escriguis mai la paraula amagada ni cap de les seves formes (plural, femení, diminutiu, verb conjugat, derivats) ni cap fragment evident d'aquesta.
- La pista ha de ser concreta i directa: descriu què és, on es fa servir o quin context evoca. Evita metàfores, endevinalles i associacions llunyanes.
- No donis la resposta amb un sinònim directe ni amb una definició de diccionari massa transparent.
- No facis servir la longitud, el nombre de lletres ni el nom de la categoria com a pista; usa la categoria només per orientar el context de la pista.
- Màxim 12 paraules. Una sola frase, sense cometes, sense dos punts i sense posar la paraula entre parèntesis.

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
	onUsage?: (usage: ClueUsage) => void;
}): Promise<string> {
	const message = await getAnthropicClient().messages.create({
		model: options.modelId,
		max_tokens: CLUE_MAX_TOKENS,
		// Match the published rates used by the puzzle cost summary.
		service_tier: "standard_only",
		inference_geo: "global",
		// Without tools, this skips upfront thinking and reserves the budget for the clue.
		thinking: { type: "between_tools" },
		output_config: { effort: "low" },
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

	// Record every response before retries or persistence can fail.
	options.onUsage?.(readClueUsage(message.usage));

	return message.content
		.filter((block): block is Anthropic.TextBlock => block.type === "text")
		.map((block) => block.text)
		.join(" ")
		.trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
	onUsage?: (usage: ClueUsage) => void;
}): Promise<string> {
	let clue = await callModel({
		modelId: options.modelId,
		displayWord: options.displayWord,
		areatematica: options.areatematica,
		onUsage: options.onUsage,
	});

	if (findLeakingTokens(clue, options.normalizedWord).length > 0) {
		clue = await callModel({
			modelId: options.modelId,
			displayWord: options.displayWord,
			areatematica: options.areatematica,
			extraInstruction: RETRY_REMINDER,
			onUsage: options.onUsage,
		});
	}

	const leaks = findLeakingTokens(clue, options.normalizedWord);
	return leaks.length > 0 ? maskLeaks(clue, leaks) : clue;
}

export async function generateWordClue(options: {
	displayWord: string;
	normalizedWord: string;
	areatematica: string;
	onUsage?: (usage: ClueUsage) => void;
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
		return;
	}

	const totalWords = options.wordSlots.length;
	let completedWords = 0;
	let failedWords = 0;
	let apiResponses = 0;
	const usage: ClueUsage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheWrite5mTokens: 0,
		cacheWrite1hTokens: 0,
		cacheReadTokens: 0,
		estimatedCostUsd: 0,
	};
	const recordUsage = (requestUsage: ClueUsage) => {
		apiResponses += 1;
		usage.inputTokens += requestUsage.inputTokens;
		usage.outputTokens += requestUsage.outputTokens;
		usage.cacheWrite5mTokens += requestUsage.cacheWrite5mTokens;
		usage.cacheWrite1hTokens += requestUsage.cacheWrite1hTokens;
		usage.cacheReadTokens += requestUsage.cacheReadTokens;
		usage.estimatedCostUsd += requestUsage.estimatedCostUsd;
	};

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
						onUsage: recordUsage,
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
					failedWords += 1;
					captureException(error);
					console.error(
						`[clue-generator] Failed to generate/store clue for word ${slot.id} (${slot.displayWord}):`,
						error,
					);
				}
			}),
		);
	}

	// Usage is unavailable for failed HTTP attempts, including hidden SDK retries.
	console.info(
		JSON.stringify({
			event: "puzzle_clue_generation_cost",
			puzzleId: options.puzzleId,
			model: CLUE_MODEL_ID,
			totalWords,
			completedWords,
			failedWords,
			apiResponses,
			costBasis: "reported_usage_at_standard_rates",
			...usage,
			estimatedCostUsd: Number(usage.estimatedCostUsd.toFixed(8)),
		}),
	);
}
