// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClueResponse } from "@/lib/clue-request-types";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { useDailyCompletion } from "./use-daily-completion";

vi.mock("@/lib/puzzle-local", () => ({
	getSortedAnonymousHistoryEntries: () => [],
}));

const clueRequests = vi.hoisted(() => ({
	dateKey: "2026-04-11",
	receivedClues: {} as Record<number, ClueResponse>,
}));
vi.mock("@/lib/use-clue-requests", () => ({
	useClueRequests: () => clueRequests,
}));

const puzzle: DailyPuzzlePublic = {
	id: "completion-test",
	dateKey: "2026-04-11",
	seed: 260411,
	algorithmVersion: "1",
	rows: 1,
	cols: 4,
	gridMask: [
		[{ wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }],
	],
	letters: ["c", "o", "s", "a"],
	initialShuffledLetters: ["c", "o", "s", "a"],
	validNormalizedGuesses: ["cosa"],
	wordSlots: [
		{
			id: 0,
			startRow: 0,
			startCol: 0,
			direction: "horizontal",
			length: 4,
			slotSalt: "salt",
			answerHash: "hash",
			answerCapsule: "capsule",
		},
	],
	hintCapsules: [],
};
const empty = createEmptyProgressState(puzzle);
const complete: PuzzleProgressState = {
	...empty,
	guessedWordIds: [0],
	guessCount: 1,
	completedAt: "2026-04-11T12:00:00Z",
};
const initialData = {
	puzzle,
	historyEntries: null,
	sessionUser: null,
	progress: null,
	rolloverAt: "2026-04-12T00:00:00Z",
};

function renderCompletion(progress = empty) {
	return renderHook(
		(derivedProgress) =>
			useDailyCompletion({ initialData, activeUser: null, derivedProgress }),
		{ initialProps: progress },
	);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false })),
	);
});
afterEach(() => {
	cleanup();
	clueRequests.receivedClues = {};
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it.each([
	{ reducedMotion: false, duration: 520 },
	{ reducedMotion: true, duration: 200 },
])(
	"waits for feedback before celebrating, reduced motion: $reducedMotion",
	({ reducedMotion, duration }) => {
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({ matches: reducedMotion })),
		);
		const { result, rerender } = renderCompletion();
		act(() => result.current.markCompleting());
		rerender(complete);
		expect(result.current.isComplete).toBe(true);
		expect(result.current.displayComplete).toBe(false);
		act(() => vi.advanceTimersByTime(duration - 1));
		expect(result.current.shouldFireConfetti).toBe(false);
		act(() => vi.advanceTimersByTime(1));
		expect(result.current.displayComplete).toBe(true);
		expect(result.current.shouldFireConfetti).toBe(true);
		expect(result.current.winDialogOpen).toBe(false);
		act(() => vi.advanceTimersByTime(900));
		expect(result.current.winDialogOpen).toBe(true);
	},
);

it("restores a completed puzzle without replaying the celebration", () => {
	const { result } = renderCompletion(complete);
	act(() => vi.runAllTimers());
	expect(result.current.displayComplete).toBe(true);
	expect(result.current.shouldFireConfetti).toBe(false);
	expect(result.current.winDialogOpen).toBe(false);
	expect(result.current.completionStats?.guessCount).toBe(1);
});

it.each([0, 520])(
	"cancels pending completion work when the game unmounts after %i ms",
	(elapsed) => {
		const { result, rerender, unmount } = renderCompletion();
		act(() => result.current.markCompleting());
		rerender(complete);
		act(() => vi.advanceTimersByTime(elapsed));
		expect(vi.getTimerCount()).toBe(1);
		unmount();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("counts clues delivered by friends alongside the free ones", () => {
	clueRequests.receivedClues = {
		0: {
			requestId: "request",
			wordId: 0,
			text: "Una pista",
			responderName: "Anna",
			at: "2026-04-11T11:00:00Z",
		},
	};
	const { result } = renderCompletion({ ...complete, hintsUsed: 3 });
	expect(result.current.cluesUsed).toBe(4);
	expect(result.current.completionStats?.hintsUsed).toBe(4);
});
