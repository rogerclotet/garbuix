import type Anthropic from "@anthropic-ai/sdk";

export const CLUE_MODEL_ID = "claude-sonnet-5-5";

// Standard, global API rates in USD per million tokens, checked 2026-10-03.
// Keep these rates and CLUE_MODEL_ID together when changing models.
// https://platform.claude.com/docs/en/about-claude/pricing
const RATES = {
	input: 2,
	output: 10,
	cacheWrite5m: 2.5,
	cacheWrite1h: 4,
	cacheRead: 0.2,
};

export function readClueUsage(usage: Anthropic.Usage) {
	const inputTokens = usage.input_tokens;
	// Includes thinking tokens; do not charge output_tokens_details a second time.
	const outputTokens = usage.output_tokens;
	const cacheWrite1hTokens =
		usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
	// Our explicit cache breakpoint defaults to 5 minutes if no breakdown is returned.
	const cacheWrite5mTokens =
		usage.cache_creation?.ephemeral_5m_input_tokens ??
		(usage.cache_creation_input_tokens ?? 0) - cacheWrite1hTokens;
	const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

	return {
		inputTokens,
		outputTokens,
		cacheWrite5mTokens,
		cacheWrite1hTokens,
		cacheReadTokens,
		estimatedCostUsd:
			(inputTokens * RATES.input +
				outputTokens * RATES.output +
				cacheWrite5mTokens * RATES.cacheWrite5m +
				cacheWrite1hTokens * RATES.cacheWrite1h +
				cacheReadTokens * RATES.cacheRead) /
			1_000_000,
	};
}

export type ClueUsage = ReturnType<typeof readClueUsage>;
