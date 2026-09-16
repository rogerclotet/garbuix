// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sealAnswerCapsule, sealHintCapsule } from "@/lib/puzzle-crypto";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { useDecodedProgress } from "./use-decoded-progress";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@/lib/use-observability", () => ({
	useObservability: () => ({ captureException }),
}));
afterEach(cleanup);

async function fixture(id: string, word: string) {
	const puzzle: DailyPuzzlePublic = {
		id,
		dateKey: "2026-06-11",
		seed: 1,
		algorithmVersion: "1",
		rows: 1,
		cols: 4,
		gridMask: [],
		letters: [...word],
		initialShuffledLetters: [...word],
		validNormalizedGuesses: [word],
		wordSlots: [
			{
				id: 0,
				startRow: 0,
				startCol: 0,
				direction: "horizontal",
				length: 4,
				slotSalt: id,
				answerHash: "unused",
				answerCapsule: await sealAnswerCapsule(word, id),
			},
		],
		hintCapsules: [
			{
				cellKey: "0,0",
				hintSalt: id,
				hintCapsule: await sealHintCapsule(word[0], id, "0,0"),
			},
		],
	};
	return {
		puzzle,
		progress: {
			...createEmptyProgressState(puzzle),
			guessedWordIds: [0],
			revealedWordTokens: { "0": id },
			hintedCells: ["0,0"],
		},
	};
}

it("publishes counters, answers and hinted letters together using real capsule decoding", async () => {
	const solved = await fixture("today", "cosa");
	const empty = createEmptyProgressState(solved.puzzle);
	const { result, rerender } = renderHook(
		({ progress }) =>
			useDecodedProgress({
				puzzle: solved.puzzle,
				progress,
				userId: "user-1",
				enabled: true,
			}),
		{ initialProps: { progress: empty } },
	);
	expect(result.current.snapshot?.progress.guessedWordIds).toEqual([]);
	rerender({ progress: solved.progress });
	// The old frame remains internally consistent while WebCrypto runs.
	expect(result.current.snapshot?.progress.guessedWordIds).toEqual([]);
	expect(result.current.snapshot?.answers).toEqual({});
	await waitFor(() =>
		expect(result.current.snapshot?.answers).toEqual({ 0: "cosa" }),
	);
	expect(result.current.snapshot?.progress.guessedWordIds).toEqual([0]);
	expect(result.current.snapshot?.hints).toEqual({ "0,0": "c" });
});

it("does not reuse yesterday's words or a previous player's decoded state", async () => {
	const yesterday = await fixture("yesterday", "cosa");
	const today = await fixture("today", "saco");
	const { result, rerender } = renderHook(
		(props) => useDecodedProgress(props),
		{ initialProps: { ...yesterday, userId: "user-1", enabled: true } },
	);
	await waitFor(() =>
		expect(result.current.snapshot?.answers).toEqual({ 0: "cosa" }),
	);
	rerender({ ...today, userId: "user-1", enabled: true });
	expect(result.current.snapshot).toBeNull();
	await waitFor(() =>
		expect(result.current.snapshot?.answers).toEqual({ 0: "saco" }),
	);
	rerender({ ...today, userId: "user-2", enabled: true });
	expect(result.current.snapshot).toBeNull();
	await waitFor(() =>
		expect(result.current.snapshot?.answers).toEqual({ 0: "saco" }),
	);
});

it("keeps the previous board hidden until decoding finishes after resume", async () => {
	const data = await fixture("today", "cosa");
	const { result, rerender } = renderHook(
		({ enabled }) => useDecodedProgress({ ...data, userId: "user-1", enabled }),
		{ initialProps: { enabled: true } },
	);
	await waitFor(() =>
		expect(result.current.snapshot?.answers).toEqual({ 0: "cosa" }),
	);
	rerender({ enabled: false });
	expect(result.current.snapshot).toBeNull();
	rerender({ enabled: true });
	expect(result.current.snapshot).toBeNull();
	await waitFor(() =>
		expect(result.current.snapshot?.answers).toEqual({ 0: "cosa" }),
	);
});

it("offers a retry if decoding fails instead of leaving an endless loading screen", async () => {
	const data = await fixture("today", "cosa");
	const digest = vi
		.spyOn(crypto.subtle, "digest")
		.mockRejectedValueOnce(new Error("decode failed"));
	const { result } = renderHook(() =>
		useDecodedProgress({ ...data, userId: "user-1", enabled: true }),
	);
	await waitFor(() => expect(result.current.hasError).toBe(true));
	digest.mockRestore();
	act(() => result.current.retry());
	await waitFor(() =>
		expect(result.current.snapshot?.answers).toEqual({ 0: "cosa" }),
	);
	expect(result.current.hasError).toBe(false);
});
