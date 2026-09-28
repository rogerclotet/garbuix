// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWordClues } from "@/lib/use-word-clues";
import type { WordCluesResult } from "@/lib/word-clues";

const { fetchClues } = vi.hoisted(() => ({
	fetchClues:
		vi.fn<
			(input: {
				data: { puzzleId: string; wordIds: number[] };
			}) => Promise<WordCluesResult>
		>(),
}));
vi.mock("@/lib/puzzle-server-fns", () => ({ getWordClues: fetchClues }));

const initialProps = {
	puzzleId: "puzzle-1",
	userId: "user-1",
	wordIds: [0],
	pendingEventCount: 0,
};

async function advance(ms = 0) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	fetchClues.mockReset().mockResolvedValue({ kind: "ok", clues: {} });
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("useWordClues", () => {
	it.each([
		"Failed to fetch",
		"Load failed",
		"NetworkError when attempting to fetch resource.",
	])("recovers clues after a transient %s failure", async (message) => {
		fetchClues
			.mockRejectedValueOnce(new TypeError(message))
			.mockResolvedValue({ kind: "ok", clues: { 0: "Recovered" } });
		const { result } = renderHook(useWordClues, { initialProps });
		await advance();
		await advance(4_999);
		expect(fetchClues).toHaveBeenCalledTimes(1);
		await advance(1);
		expect(result.current).toEqual({ 0: "Recovered" });
		expect(fetchClues).toHaveBeenCalledTimes(2);
	});

	it("waits for connectivity before fetching clues", async () => {
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		fetchClues.mockResolvedValue({ kind: "ok", clues: { 0: "Connected" } });
		const { result } = renderHook(useWordClues, { initialProps });
		await advance(60_000);
		expect(fetchClues).not.toHaveBeenCalled();
		online.mockReturnValue(true);
		fireEvent.online(window);
		await advance();
		expect(result.current).toEqual({ 0: "Connected" });
	});

	it("preserves a failed request while offline and retries after reconnecting", async () => {
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		fetchClues
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValue({ kind: "ok", clues: { 0: "Recovered" } });
		const { result } = renderHook(useWordClues, { initialProps });
		await advance();
		online.mockReturnValue(false);
		await advance(60_000);
		expect(fetchClues).toHaveBeenCalledTimes(1);
		online.mockReturnValue(true);
		fireEvent.online(window);
		await advance();
		expect(result.current).toEqual({ 0: "Recovered" });
	});

	it("stops retrying after exhausting the network retry limit", async () => {
		const failure = new TypeError("Failed to fetch");
		fetchClues.mockRejectedValue(failure);
		renderHook(useWordClues, { initialProps });
		await advance();
		await advance(5_000);
		await advance(10_000);
		await advance(20_000);
		expect(fetchClues).toHaveBeenCalledTimes(4);
		fireEvent.online(window);
		await advance(60_000);
		expect(fetchClues).toHaveBeenCalledTimes(4);
	});

	it("does not retry application failures", async () => {
		const failure = new TypeError("Cannot read properties of undefined");
		fetchClues.mockRejectedValue(failure);
		renderHook(useWordClues, { initialProps });
		await advance();
		await advance(60_000);
		expect(fetchClues).toHaveBeenCalledTimes(1);
	});

	it("deduplicates in-flight requests and then fetches only newly requested words", async () => {
		const executor =
			vi.fn<(resolve: (result: WordCluesResult) => void) => void>();
		const response = new Promise<WordCluesResult>(executor);
		fetchClues
			.mockReturnValueOnce(response)
			.mockResolvedValue({ kind: "ok", clues: { 1: "Second" } });
		const { result, rerender } = renderHook(useWordClues, {
			initialProps,
			wrapper: StrictMode,
		});
		rerender({ ...initialProps, wordIds: [0, 0, 1], pendingEventCount: 1 });
		rerender({ ...initialProps, wordIds: [0, 1] });
		expect(fetchClues).toHaveBeenCalledTimes(1);
		await act(async () => {
			executor.mock.calls[0][0]({ kind: "ok", clues: { 0: "First" } });
		});
		await advance();
		expect(fetchClues).toHaveBeenCalledTimes(2);
		expect(fetchClues).toHaveBeenLastCalledWith({
			data: { puzzleId: "puzzle-1", wordIds: [1] },
		});
		expect(result.current).toEqual({ 0: "First", 1: "Second" });
	});

	it("waits for progress sync and keeps loaded clues through subsequent syncs", async () => {
		fetchClues.mockResolvedValue({ kind: "ok", clues: { 0: "Saved" } });
		const { result, rerender } = renderHook(useWordClues, {
			initialProps: { ...initialProps, pendingEventCount: 1 },
		});
		expect(fetchClues).not.toHaveBeenCalled();
		rerender(initialProps);
		await advance();
		for (let i = 0; i < 30; i++) {
			rerender({ ...initialProps, pendingEventCount: 1 });
			rerender(initialProps);
		}
		expect(result.current).toEqual({ 0: "Saved" });
		expect(fetchClues).toHaveBeenCalledTimes(1);
	});

	it("respects cooldown through queue changes, new words and puzzle changes", async () => {
		fetchClues
			.mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 60 })
			.mockResolvedValue({
				kind: "ok",
				clues: { 0: "Ready", 1: "Also ready" },
			});
		const { result, rerender } = renderHook(useWordClues, { initialProps });
		await advance();
		rerender({ ...initialProps, pendingEventCount: 1 });
		rerender({ ...initialProps, puzzleId: "puzzle-2", wordIds: [0, 1] });
		fireEvent.online(window);
		await advance(59_999);
		expect(fetchClues).toHaveBeenCalledTimes(1);
		await advance(1);
		expect(fetchClues).toHaveBeenCalledTimes(2);
		expect(result.current).toEqual({ 0: "Ready", 1: "Also ready" });
	});

	it("bounds missing-clue retries even when unrelated progress repeatedly syncs", async () => {
		const { rerender } = renderHook(useWordClues, { initialProps });
		await advance();
		for (let i = 0; i < 50; i++) {
			rerender({ ...initialProps, pendingEventCount: 1 });
			rerender(initialProps);
			await advance(1_000);
		}
		expect(fetchClues).toHaveBeenCalledTimes(4);
		await advance(60_000);
		expect(fetchClues).toHaveBeenCalledTimes(4);
	});

	it("accepts late generation without refetching clues already returned", async () => {
		fetchClues
			.mockResolvedValueOnce({ kind: "ok", clues: { 0: "First" } })
			.mockResolvedValue({ kind: "ok", clues: { 1: "Late" } });
		const { result } = renderHook(useWordClues, {
			initialProps: { ...initialProps, wordIds: [0, 1] },
		});
		await advance();
		await advance(5_000);
		expect(fetchClues).toHaveBeenLastCalledWith({
			data: { puzzleId: "puzzle-1", wordIds: [1] },
		});
		expect(result.current).toEqual({ 0: "First", 1: "Late" });
	});

	it("isolates old responses when the account changes", async () => {
		const executor =
			vi.fn<(resolve: (result: WordCluesResult) => void) => void>();
		const response = new Promise<WordCluesResult>(executor);
		fetchClues
			.mockReturnValueOnce(response)
			.mockResolvedValue({ kind: "ok", clues: { 0: "New account" } });
		const { result, rerender } = renderHook(useWordClues, { initialProps });
		rerender({ ...initialProps, userId: "user-2" });
		await advance();
		await act(async () => {
			executor.mock.calls[0][0]({ kind: "ok", clues: { 0: "Old account" } });
		});
		expect(result.current).toEqual({ 0: "New account" });
	});

	it("batches large sets within the endpoint limit", async () => {
		fetchClues.mockImplementation(async ({ data }) => ({
			kind: "ok",
			clues: Object.fromEntries(data.wordIds.map((id) => [id, `Clue ${id}`])),
		}));
		renderHook(useWordClues, {
			initialProps: {
				...initialProps,
				wordIds: Array.from({ length: 25 }, (_, id) => id),
			},
		});
		await advance();
		expect(
			fetchClues.mock.calls.map(([input]) => input.data.wordIds.length),
		).toEqual([20, 5]);
	});

	it("stops scheduled retries on unmount", async () => {
		const { unmount } = renderHook(useWordClues, { initialProps });
		await advance();
		unmount();
		fireEvent.online(window);
		await advance(60_000);
		expect(fetchClues).toHaveBeenCalledTimes(1);
	});
});
