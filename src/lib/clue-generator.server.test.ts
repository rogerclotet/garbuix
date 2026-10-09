import { format } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "@anthropic-ai/sdk";
import { captureException } from "@sentry/tanstackstart-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { puzzleWordClues } from "@/db/schema";
import { readClueUsage } from "@/lib/clue-generation-usage";
import type { DailyPuzzlePrivateWord } from "@/lib/puzzle-types";

const { create, save, replace } = vi.hoisted(() => ({
	create:
		vi.fn<
			(
				params: Anthropic.MessageCreateParamsNonStreaming,
			) => Promise<Pick<Anthropic.Message, "content" | "usage" | "stop_reason">>
		>(),
	save: vi.fn<() => Promise<void>>(),
	replace: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => ({
	...(await importOriginal<typeof import("@anthropic-ai/sdk")>()),
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
			values: () => ({
				onConflictDoNothing: save,
				onConflictDoUpdate: replace,
			}),
		}),
	},
}));
vi.mock("@sentry/tanstackstart-react", () => ({
	captureException: vi.fn(),
}));
vi.mock("@/data/catalan-definitions.json", () => ({
	default: {
		paraigua: [
			"(nom) Estri portàtil per a protegir-se de la pluja.",
			"(nom) Protecció davant d'un perill.",
		],
	},
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
	stopReason: Anthropic.StopReason = "end_turn",
): Pick<Anthropic.Message, "content" | "usage" | "stop_reason"> {
	return {
		stop_reason: stopReason,
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
	replace.mockReset().mockResolvedValue(undefined);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("clue generation log privacy", () => {
	it.each(["success", "api", "database"])(
		"does not expose answers or clues on %s",
		async (outcome) => {
			const logs = [
				vi.spyOn(console, "log").mockImplementation(() => {}),
				vi.spyOn(console, "error").mockImplementation(() => {}),
				vi.spyOn(console, "info").mockImplementation(() => {}),
			];
			vi.mocked(captureException).mockClear();
			const clue = "Es desplega quan plou.";
			const error = new Error(
				`Request parameters: ${word.displayWord}; ${clue}`,
			);
			if (outcome === "api") {
				create.mockRejectedValueOnce(
					new APIError(
						400,
						{ error: { message: error.message } },
						undefined,
						new Headers({ "request-id": "request-test" }),
					),
				);
			}
			if (outcome === "database") save.mockRejectedValueOnce(error);

			await generateAndStoreCluesForPuzzle({
				puzzleId: "private-puzzle",
				wordSlots: [word],
			});

			const output = [
				...logs.flatMap((log) => log.mock.calls.map((args) => format(...args))),
				...vi
					.mocked(captureException)
					.mock.calls.map((args) => format(...args)),
			].join("\n");
			expect(output).not.toContain(word.displayWord);
			expect(output).not.toContain(word.normalizedWord);
			expect(output).not.toContain(clue);
			expect(output).toContain("private-puzzle");
			if (outcome === "api") {
				expect(output).toContain('"status":400');
				expect(output).toContain("request-test");
			}
		},
	);
});

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
		expect(usage.estimatedCostUsd).toBeCloseTo(0.000114, 10);
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
		).toBeCloseTo(0.0000275, 10);
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

		expect(log).toHaveBeenCalledWith(
			JSON.stringify({
				event: "puzzle_clue_generation_cost",
				puzzleId: "retry",
				model: "claude-haiku-5-5",
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
				estimatedCostUsd: 0.000045,
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
				expect.stringContaining('"estimatedCostUsd":0.000015'),
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

		expect(
			log.mock.calls.filter(([line]) =>
				line.includes('"event":"puzzle_clue_generation_cost"'),
			),
		).toHaveLength(2);
		expect(log).toHaveBeenCalledWith(
			expect.stringMatching(
				/"puzzleId":"small".*"apiResponses":1.*"estimatedCostUsd":0.000015/,
			),
		);
		expect(log).toHaveBeenCalledWith(
			expect.stringMatching(
				/"puzzleId":"large".*"apiResponses":6.*"estimatedCostUsd":0.00009/,
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

describe("clue regeneration", () => {
	it("replaces an existing clue and model only when requested", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		await generateAndStoreCluesForPuzzle({
			puzzleId: "regenerate",
			wordSlots: [word],
			replaceExisting: true,
		});
		expect(replace).toHaveBeenCalledExactlyOnceWith({
			target: [puzzleWordClues.puzzleId, puzzleWordClues.wordId],
			set: {
				normalizedWord: word.normalizedWord,
				sonnetModel: "claude-haiku-5-5",
				sonnetClue: "Es desplega quan plou.",
				createdAt: expect.any(Date),
			},
		});
		expect(save).not.toHaveBeenCalled();
	});

	it("preserves stored clues by default", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		await generateAndStoreCluesForPuzzle({
			puzzleId: "preserve",
			wordSlots: [word],
		});
		expect(save).toHaveBeenCalledOnce();
		expect(replace).not.toHaveBeenCalled();
	});

	it("leaves the old clue untouched if forced regeneration fails", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		create.mockRejectedValueOnce(new Error("API unavailable"));
		await generateAndStoreCluesForPuzzle({
			puzzleId: "preserve-on-failure",
			wordSlots: [word],
			replaceExisting: true,
		});
		expect(replace).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
	});
});

describe("clue prompt", () => {
	function sentPrompt(): string {
		const content = create.mock.calls[0][0].messages[0].content;
		if (typeof content !== "string") throw new Error("Expected a text prompt");
		return content;
	}

	it("gives the model the word's dictionary senses", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		await generateAndStoreCluesForPuzzle({
			puzzleId: "senses",
			wordSlots: [word],
		});
		expect(sentPrompt()).toContain(
			[
				"Accepcions:",
				"1. (nom) Estri portàtil per a protegir-se de la pluja.",
				"2. (nom) Protecció davant d'un perill.",
			].join("\n"),
		);
	});

	it("reports a missing definition without exposing the word", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const undefinedWord = {
			...word,
			id: 3,
			displayWord: "xiribec",
			normalizedWord: "xiribec",
		};
		await generateAndStoreCluesForPuzzle({
			puzzleId: "legacy",
			wordSlots: [undefinedWord],
		});
		expect(sentPrompt()).not.toContain("Accepcions:");
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			JSON.stringify({
				event: "puzzle_clue_definition_missing",
				puzzleId: "legacy",
				wordId: 3,
			}),
		);
		expect(save).toHaveBeenCalledOnce();
	});

	it.each(["max_tokens", "refusal"] as const)(
		"stores nothing when the response stops with %s",
		async (stopReason) => {
			vi.spyOn(console, "info").mockImplementation(() => {});
			create.mockResolvedValueOnce(response("Es desplega", {}, stopReason));
			await generateAndStoreCluesForPuzzle({
				puzzleId: "truncated",
				wordSlots: [word],
			});
			expect(save).not.toHaveBeenCalled();
		},
	);
});
