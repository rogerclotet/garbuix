import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readClueUsage } from "@/lib/clue-generation-usage";
import type { DailyPuzzlePrivateWord } from "@/lib/puzzle-types";

const { create, save } = vi.hoisted(() => ({
	create: vi.fn<() => Promise<Pick<Anthropic.Message, "content" | "usage">>>(),
	save: vi.fn<() => Promise<void>>(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: class {
		messages = { create };
	},
}));
vi.mock("@/lib/server-env", () => ({
	getServerEnv: () => ({ ANTHROPIC_API_KEY: "test-key" }),
}));
vi.mock("@/lib/db", () => ({
	db: {
		insert: () => ({
			values: () => ({ onConflictDoNothing: save }),
		}),
	},
}));
vi.mock("@sentry/tanstackstart-react", () => ({
	captureException: vi.fn(),
}));

import { generateAndStoreCluesForPuzzle } from "@/lib/clue-generator.server";

const word: DailyPuzzlePrivateWord = {
	id: 0,
	displayWord: "paraigua",
	normalizedWord: "paraigua",
	startRow: 0,
	startCol: 0,
	direction: "horizontal",
};

function response(
	text = "Es desplega quan plou.",
	usage: Partial<Anthropic.Usage> = {},
): Pick<Anthropic.Message, "content" | "usage"> {
	return {
		content: [{ type: "text", text, citations: null }],
		usage: {
			input_tokens: 100,
			output_tokens: 10,
			cache_creation: null,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			inference_geo: "global",
			output_tokens_details: null,
			server_tool_use: null,
			service_tier: "standard",
			...usage,
		},
	};
}

beforeEach(() => {
	create.mockReset().mockResolvedValue(response());
	save.mockReset().mockResolvedValue(undefined);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("clue generation cost", () => {
	it("prices cache writes and reads separately and counts thinking only once", () => {
		const usage = readClueUsage(
			response(undefined, {
				output_tokens: 30,
				output_tokens_details: { thinking_tokens: 10 },
				cache_creation_input_tokens: 500,
				cache_creation: {
					ephemeral_5m_input_tokens: 200,
					ephemeral_1h_input_tokens: 300,
				},
				cache_read_input_tokens: 400,
			}).usage,
		);
		expect(usage.estimatedCostUsd).toBeCloseTo(0.00228, 10);
		expect(usage).toMatchObject({
			inputTokens: 100,
			outputTokens: 30,
			cacheWrite5mTokens: 200,
			cacheWrite1hTokens: 300,
			cacheReadTokens: 400,
		});
	});

	it("uses the request's five-minute TTL when the cache breakdown is absent", () => {
		expect(
			readClueUsage(
				response(undefined, { cache_creation_input_tokens: 100 }).usage,
			).estimatedCostUsd,
		).toBeCloseTo(0.00055, 10);
	});

	it("includes both responses when a leaking clue is regenerated", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		create
			.mockResolvedValueOnce(response("paraigua"))
			.mockResolvedValueOnce(
				response(undefined, { input_tokens: 200, output_tokens: 20 }),
			);

		await generateAndStoreCluesForPuzzle({
			puzzleId: "retry",
			wordSlots: [word],
		});

		expect(log).toHaveBeenCalledExactlyOnceWith(
			JSON.stringify({
				event: "puzzle_clue_generation_cost",
				puzzleId: "retry",
				model: "claude-sonnet-5-5",
				totalWords: 1,
				completedWords: 1,
				failedWords: 0,
				apiResponses: 2,
				costBasis: "reported_usage_at_standard_rates",
				inputTokens: 300,
				outputTokens: 30,
				cacheWrite5mTokens: 0,
				cacheWrite1hTokens: 0,
				cacheReadTokens: 0,
				estimatedCostUsd: 0.0009,
			}),
		);
	});

	it.each(["retry", "persistence"])(
		"retains paid usage when %s fails",
		async (failure) => {
			const log = vi.spyOn(console, "info").mockImplementation(() => {});
			if (failure === "retry") {
				create
					.mockResolvedValueOnce(response("paraigua"))
					.mockRejectedValueOnce(new Error("API unavailable"));
			} else {
				save.mockRejectedValueOnce(new Error("Database unavailable"));
			}

			await generateAndStoreCluesForPuzzle({
				puzzleId: "failure",
				wordSlots: [word],
			});

			expect(log).toHaveBeenCalledOnce();
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining('"estimatedCostUsd":0.0003'),
			);
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining(
					'"completedWords":0,"failedWords":1,"apiResponses":1',
				),
			);
		},
	);

	it("keeps concurrent puzzle totals separate and sums all batches", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		await Promise.all([
			generateAndStoreCluesForPuzzle({ puzzleId: "small", wordSlots: [word] }),
			generateAndStoreCluesForPuzzle({
				puzzleId: "large",
				wordSlots: Array.from({ length: 6 }, (_, id) => ({ ...word, id })),
			}),
		]);

		expect(log).toHaveBeenCalledTimes(2);
		expect(log).toHaveBeenCalledWith(
			expect.stringMatching(
				/"puzzleId":"small".*"apiResponses":1.*"estimatedCostUsd":0.0003/,
			),
		);
		expect(log).toHaveBeenCalledWith(
			expect.stringMatching(
				/"puzzleId":"large".*"apiResponses":6.*"estimatedCostUsd":0.0018/,
			),
		);
	});

	it("logs zero cost when every API request fails without usage", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		create.mockRejectedValueOnce(new Error("API unavailable"));
		await generateAndStoreCluesForPuzzle({
			puzzleId: "failed",
			wordSlots: [word],
		});
		expect(log).toHaveBeenCalledWith(
			expect.stringMatching(
				/"failedWords":1,"apiResponses":0.*"estimatedCostUsd":0/,
			),
		);
	});
});
