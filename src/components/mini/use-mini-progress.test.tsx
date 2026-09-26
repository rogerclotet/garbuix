// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateMiniCrossword } from "@/lib/mini-generator";
import { readMiniSaves, writeMiniSave } from "@/lib/mini-local";
import { createPuzzleEvent } from "@/lib/puzzle-client";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { useMiniProgress } from "./use-mini-progress";

const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("@/lib/mini-server-fns", () => ({ syncMiniProgress: sync }));

beforeEach(() => {
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	});
	sync.mockReset();
	sync.mockImplementation(
		async ({ data }: { data: PuzzleProgressState }) => data,
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function fixture() {
	const generated = generateMiniCrossword("2026-01-01");
	const { publicSnapshot } = await buildPuzzleSnapshots({
		...generated,
		initialShuffledLetters: generated.shuffledLetters,
		dateKey: "2026-01-01",
		seed: 260101,
		puzzleId: "mini:2026-01-01",
		algorithmVersion: "mini-v1",
		availableWordCount: 5,
	});
	return publicSnapshot;
}

it("restores unlimited guest hints after leaving and returning", async () => {
	const puzzle = await fixture();
	const props = { puzzle, userId: null, initialProgress: null };
	const first = renderHook(() => useMiniProgress(props));
	await waitFor(() => expect(first.result.current.ready).toBe(true));
	act(() => {
		for (const capsule of puzzle.hintCapsules.slice(0, 5))
			first.result.current.dispatch(
				createPuzzleEvent("hint_used", { cellKey: capsule.cellKey }),
			);
	});
	expect(first.result.current.progress.hintsUsed).toBe(5);
	first.unmount();
	const returning = renderHook(() => useMiniProgress(props));
	await waitFor(() => expect(returning.result.current.ready).toBe(true));
	expect(returning.result.current.progress.hintsUsed).toBe(5);
	expect(sync).not.toHaveBeenCalled();
});

it("keeps new local play when an older account sync finishes", async () => {
	const puzzle = await fixture();
	const empty = createEmptyProgressState(puzzle);
	writeMiniSave("parent", puzzle.dateKey, empty);
	let finish: (progress: PuzzleProgressState) => void = () => {};
	sync.mockImplementationOnce(
		() =>
			new Promise<PuzzleProgressState>((resolve) => {
				finish = resolve;
			}),
	);
	const { result } = renderHook(() =>
		useMiniProgress({ puzzle, userId: "parent", initialProgress: null }),
	);
	await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
	act(() =>
		result.current.dispatch(
			createPuzzleEvent("hint_used", {
				cellKey: puzzle.hintCapsules[0].cellKey,
			}),
		),
	);
	await act(async () => finish(empty));
	expect(result.current.progress.hintsUsed).toBe(1);
	expect(readMiniSaves("parent")[puzzle.dateKey].hintsUsed).toBe(1);
});

it("imports guest progress into Mini for a signed-in parent", async () => {
	const puzzle = await fixture();
	const guest = {
		...createEmptyProgressState(puzzle),
		hintedCells: puzzle.hintCapsules.slice(0, 4).map((cell) => cell.cellKey),
		hintsUsed: 4,
	};
	writeMiniSave(null, puzzle.dateKey, guest);
	const { result } = renderHook(() =>
		useMiniProgress({ puzzle, userId: "parent", initialProgress: null }),
	);
	await waitFor(() => expect(sync).toHaveBeenCalled());
	expect(result.current.progress.hintsUsed).toBe(4);
	expect(readMiniSaves("parent")[puzzle.dateKey].hintsUsed).toBe(4);
});
