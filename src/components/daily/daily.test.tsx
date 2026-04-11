// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Daily } from "./daily";

const {
	resolveGuessMock,
	applyLocalEventMock,
	captureEventMock,
	captureExceptionMock,
} = vi.hoisted(() => ({
	resolveGuessMock: vi.fn(),
	applyLocalEventMock: vi.fn(),
	captureEventMock: vi.fn(),
	captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/puzzle-client", async () => {
	const actual = await vi.importActual<typeof import("@/lib/puzzle-client")>(
		"@/lib/puzzle-client",
	);

	return {
		...actual,
		decodeHintLetters: vi.fn().mockResolvedValue({}),
		decodeRevealedAnswers: vi.fn().mockResolvedValue({}),
		resolveGuess: resolveGuessMock,
	};
});

vi.mock("@/lib/puzzle-local", () => ({
	getDeviceId: vi.fn(() => "device-1"),
	getSortedAnonymousHistoryEntries: vi.fn(() => []),
}));

vi.mock("@/lib/puzzle-streaks", () => ({
	calculateHistoryStreaks: vi.fn(() => ({
		currentStreak: 0,
		longestStreak: 0,
		totalCompleted: 0,
	})),
	upsertHistoryEntry: vi.fn((entries) => entries),
}));

vi.mock("@/lib/use-active-session-user", () => ({
	useActiveSessionUser: vi.fn(() => ({ activeUser: null })),
}));

vi.mock("@/lib/use-observability", () => ({
	useObservability: vi.fn(() => ({
		captureEvent: captureEventMock,
		captureException: captureExceptionMock,
	})),
}));

vi.mock("./use-daily-progress", () => ({
	useDailyProgress: vi.fn(() => ({
		applyLocalEvent: applyLocalEventMock,
		derivedProgress: {
			puzzleId: "puzzle-1",
			guessHashes: [],
			guessedWordIds: [],
			revealedWordTokens: {},
			hintedCells: [],
			hintsUsed: 0,
			guessCount: 0,
			shuffledLetters: ["c", "o", "s", "a"],
			completedAt: null,
			lastSyncedAt: null,
		},
		isProgressReady: true,
	})),
}));

vi.mock("./daily-grid", () => ({
	DailyGrid: vi.fn(() => <div data-testid="daily-grid" />),
}));

vi.mock("./daily-word-list", () => ({
	DailyWordList: vi.fn(() => <div data-testid="daily-word-list" />),
}));

vi.mock("./share-progress", () => ({
	shareProgress: vi.fn(),
}));

function installMatchMediaMock(matches = false) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
			onchange: null,
		})),
	});
}

function renderDaily() {
	return render(
		<Daily
			initialData={{
				historyEntries: null,
				puzzle: {
					id: "puzzle-1",
					dateKey: "2026-04-11",
					seed: 260411,
					algorithmVersion: "1",
					rows: 1,
					cols: 4,
					gridMask: [
						[
							{ wordIds: [0] },
							{ wordIds: [0] },
							{ wordIds: [0] },
							{ wordIds: [0] },
						],
					],
					letters: ["c", "o", "s", "a"],
					initialShuffledLetters: ["c", "o", "s", "a"],
					validNormalizedGuesses: ["cosa", "saco"],
					wordSlots: [
						{
							id: 0,
							startRow: 0,
							startCol: 0,
							direction: "horizontal",
							length: 4,
							slotSalt: "slot-0",
							answerHash: "hash-0",
							answerCapsule: "capsule-0",
						},
					],
					hintCapsules: [],
				},
				progress: null,
				rolloverAt: "2026-04-12T00:00:00.000Z",
				sessionUser: null,
			}}
		/>,
	);
}

async function submitCurrentGuess() {
	for (const letter of ["C", "O", "S", "A"]) {
		fireEvent.pointerDown(screen.getByRole("button", { name: letter }), {
			button: 0,
			pointerType: "touch",
		});
	}

	fireEvent.pointerDown(screen.getByRole("button", { name: "Comprovar" }), {
		button: 0,
		pointerType: "touch",
	});

	await waitFor(() => {
		expect(resolveGuessMock).toHaveBeenCalledTimes(1);
	});
}

describe("Daily submit feedback", () => {
	beforeEach(() => {
		resolveGuessMock.mockReset();
		applyLocalEventMock.mockReset();
		captureEventMock.mockReset();
		captureExceptionMock.mockReset();
		installMatchMediaMock(false);
	});

	afterEach(() => {
		cleanup();
	});

	it.each([
		["new_word", "text-primary"],
		["already_found", "text-foreground"],
		["valid_but_not_in_puzzle", "opacity-65"],
		["not_in_dictionary", "text-destructive"],
	] as const)("shows %s feedback with the correct tone and clears the input", async (kind, expectedClassName) => {
		resolveGuessMock.mockResolvedValue({
			kind,
			displayWord: kind === "new_word" ? "cosa" : null,
			guessHash: `guess-${kind}`,
			normalizedGuess: "cosa",
			matchedSlotId: kind === "new_word" || kind === "already_found" ? 0 : null,
			unlockToken: kind === "new_word" ? "unlock-0" : null,
		});

		renderDaily();
		await submitCurrentGuess();

		const feedback = await waitFor(() => {
			const nextFeedback = document.querySelector(
				'[data-slot="submit-feedback"]',
			);
			expect(nextFeedback).not.toBeNull();
			return nextFeedback as HTMLElement;
		});

		expect(feedback.getAttribute("data-feedback-kind")).toBe(kind);
		expect(feedback.className).toContain(expectedClassName);
		expect(
			document.querySelector('[data-slot="current-guess"]')?.textContent,
		).toBe("");
	});

	it("disables the feedback animation path when reduced motion is preferred", async () => {
		installMatchMediaMock(true);
		resolveGuessMock.mockResolvedValue({
			kind: "new_word",
			displayWord: "cosa",
			guessHash: "guess-new-word",
			normalizedGuess: "cosa",
			matchedSlotId: 0,
			unlockToken: "unlock-0",
		});

		renderDaily();
		await submitCurrentGuess();

		const feedback = await waitFor(() => {
			const nextFeedback = document.querySelector(
				'[data-slot="submit-feedback"]',
			);
			expect(nextFeedback).not.toBeNull();
			return nextFeedback as HTMLElement;
		});

		expect(feedback.getAttribute("data-reduced-motion")).toBe("true");
		expect(feedback.className).toContain(
			"daily-submit-feedback-reduced-motion",
		);
	});
});
