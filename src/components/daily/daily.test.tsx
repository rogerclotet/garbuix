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
	hasSeenHowToPlayMock,
	markHowToPlaySeenMock,
	hasSeenProfilePreferencesTipMock,
	markProfilePreferencesTipSeenMock,
	hasSeenWelcomeMock,
	markWelcomeSeenMock,
	openHowToPlayMock,
	openProfilePreferencesTipMock,
} = vi.hoisted(() => ({
	resolveGuessMock: vi.fn(),
	applyLocalEventMock: vi.fn(),
	captureEventMock: vi.fn(),
	captureExceptionMock: vi.fn(),
	hasSeenHowToPlayMock: vi.fn(() => true),
	markHowToPlaySeenMock: vi.fn(),
	hasSeenProfilePreferencesTipMock: vi.fn(() => true),
	markProfilePreferencesTipSeenMock: vi.fn(),
	hasSeenWelcomeMock: vi.fn(() => true),
	markWelcomeSeenMock: vi.fn(),
	openHowToPlayMock: vi.fn(),
	openProfilePreferencesTipMock: vi.fn(),
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
	hasSeenHowToPlay: hasSeenHowToPlayMock,
	markHowToPlaySeen: markHowToPlaySeenMock,
	hasSeenProfilePreferencesTip: hasSeenProfilePreferencesTipMock,
	markProfilePreferencesTipSeen: markProfilePreferencesTipSeenMock,
	hasSeenWelcome: hasSeenWelcomeMock,
	markWelcomeSeen: markWelcomeSeenMock,
}));

vi.mock("./how-to-play-store", () => ({
	openHowToPlay: openHowToPlayMock,
}));

vi.mock("@/components/profile-preferences-tip-store", () => ({
	openProfilePreferencesTip: openProfilePreferencesTipMock,
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
			clueWordIds: [],
			hintsUsed: 0,
			guessCount: 0,
			bonusWordsFound: 0,
			shuffledLetters: ["c", "o", "s", "a"],
			completedAt: null,
			lastSyncedAt: null,
		},
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

vi.mock("./daily-confetti", () => ({
	DailyConfetti: vi.fn(() => null),
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

function installLocalStorageMock(initial: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(initial));
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
			removeItem: (key: string) => {
				store.delete(key);
			},
			clear: () => {
				store.clear();
			},
		},
	});
}

// jsdom has no ResizeObserver, and the keypad reports its height through one so
// the board above it can claim the room it leaves.
function installResizeObserverMock() {
	Object.defineProperty(window, "ResizeObserver", {
		configurable: true,
		writable: true,
		value: class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	});
}

function installVibrateMock() {
	Object.defineProperty(window.navigator, "vibrate", {
		configurable: true,
		value: vi.fn(),
	});

	return window.navigator.vibrate as unknown as ReturnType<typeof vi.fn>;
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
		fireEvent.pointerUp(screen.getByRole("button", { name: letter }), {
			button: 0,
			pointerType: "touch",
		});
	}

	fireEvent.pointerDown(screen.getByRole("button", { name: "Comprovar" }), {
		button: 0,
		pointerType: "touch",
	});
	fireEvent.pointerUp(screen.getByRole("button", { name: "Comprovar" }), {
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
		hasSeenHowToPlayMock.mockReset();
		hasSeenHowToPlayMock.mockReturnValue(true);
		markHowToPlaySeenMock.mockReset();
		hasSeenProfilePreferencesTipMock.mockReset();
		hasSeenProfilePreferencesTipMock.mockReturnValue(true);
		markProfilePreferencesTipSeenMock.mockReset();
		hasSeenWelcomeMock.mockReset();
		hasSeenWelcomeMock.mockReturnValue(true);
		markWelcomeSeenMock.mockReset();
		openHowToPlayMock.mockReset();
		openProfilePreferencesTipMock.mockReset();
		installMatchMediaMock(false);
		installResizeObserverMock();
	});

	afterEach(() => {
		cleanup();
	});

	it.each([
		["new_word", "text-primary"],
		["already_found", "text-foreground"],
		["valid_but_not_in_puzzle", "opacity-65"],
		["not_in_dictionary", "text-destructive"],
	] as const)(
		"shows %s feedback with the correct tone and clears the input",
		async (kind, expectedClassName) => {
			resolveGuessMock.mockResolvedValue({
				kind,
				isRepeatGuess: false,
				displayWord: kind === "new_word" ? "cosa" : null,
				guessHash: `guess-${kind}`,
				normalizedGuess: "cosa",
				matchedSlotId:
					kind === "new_word" || kind === "already_found" ? 0 : null,
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
		},
	);

	it.each([
		["valid_but_not_in_puzzle", "opacity-65"],
		["not_in_dictionary", "text-destructive"],
	] as const)(
		"shows %s feedback on repeated submit and does not apply a duplicate event",
		async (kind, expectedClassName) => {
			resolveGuessMock.mockResolvedValue({
				kind,
				isRepeatGuess: true,
				displayWord: null,
				guessHash: `guess-${kind}`,
				normalizedGuess: "cosa",
				matchedSlotId: null,
				unlockToken: null,
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
			expect(applyLocalEventMock).not.toHaveBeenCalled();
		},
	);

	it("disables the feedback animation path when reduced motion is preferred", async () => {
		installMatchMediaMock(true);
		resolveGuessMock.mockResolvedValue({
			kind: "new_word",
			isRepeatGuess: false,
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

	it("opens the how-to-play dialog on first visit and marks it seen", async () => {
		hasSeenHowToPlayMock.mockReturnValue(false);

		renderDaily();

		await waitFor(() => {
			expect(markHowToPlaySeenMock).toHaveBeenCalledTimes(1);
		});
		expect(openHowToPlayMock).toHaveBeenCalledTimes(1);
		expect(captureEventMock).toHaveBeenCalledWith("how_to_play_shown", {
			trigger: "first_visit",
		});
	});

	it("does not auto-open the how-to-play dialog on subsequent visits", async () => {
		hasSeenHowToPlayMock.mockReturnValueOnce(true);

		renderDaily();

		await waitFor(() => {
			expect(captureEventMock).toHaveBeenCalledWith(
				"puzzle_loaded",
				expect.any(Object),
			);
		});
		expect(openHowToPlayMock).not.toHaveBeenCalled();
		expect(markHowToPlaySeenMock).not.toHaveBeenCalled();
	});

	it("opens the profile preferences tip after the how-to-play tutorial and marks it seen", async () => {
		hasSeenHowToPlayMock.mockReturnValueOnce(true);
		hasSeenProfilePreferencesTipMock.mockReturnValueOnce(false);

		renderDaily();

		await waitFor(() => {
			expect(markProfilePreferencesTipSeenMock).toHaveBeenCalledTimes(1);
		});
		expect(openProfilePreferencesTipMock).toHaveBeenCalledTimes(1);
		expect(captureEventMock).toHaveBeenCalledWith(
			"profile_preferences_tip_shown",
			{ trigger: "return_visit" },
		);
	});

	it("does not auto-open the profile preferences tip on first visit before how-to-play", async () => {
		hasSeenHowToPlayMock.mockReturnValue(false);

		renderDaily();

		await waitFor(() => {
			expect(openHowToPlayMock).toHaveBeenCalledTimes(1);
		});
		expect(openProfilePreferencesTipMock).not.toHaveBeenCalled();
		expect(markProfilePreferencesTipSeenMock).not.toHaveBeenCalled();
	});

	it("does not auto-open the profile preferences tip once it has been seen", async () => {
		hasSeenHowToPlayMock.mockReturnValueOnce(true);
		hasSeenProfilePreferencesTipMock.mockReturnValueOnce(true);

		renderDaily();

		await waitFor(() => {
			expect(captureEventMock).toHaveBeenCalledWith(
				"puzzle_loaded",
				expect.any(Object),
			);
		});
		expect(openProfilePreferencesTipMock).not.toHaveBeenCalled();
		expect(markProfilePreferencesTipSeenMock).not.toHaveBeenCalled();
	});

	it("triggers haptics on the first touch release", async () => {
		const vibrateMock = installVibrateMock();

		renderDaily();

		const letterButton = screen.getByRole("button", { name: "C" });
		fireEvent.pointerDown(letterButton, {
			button: 0,
			pointerType: "touch",
		});
		expect(vibrateMock).not.toHaveBeenCalled();

		fireEvent.pointerUp(letterButton, {
			button: 0,
			pointerType: "touch",
		});

		expect(vibrateMock).toHaveBeenCalledWith(14);
		expect(
			document.querySelector('[data-slot="current-guess"]')?.textContent,
		).toBe("c");
	});

	it("does not vibrate when the user has disabled vibration", async () => {
		installLocalStorageMock({ "paraules-vibration-v1": "0" });
		const vibrateMock = installVibrateMock();

		renderDaily();

		const letterButton = screen.getByRole("button", { name: "C" });
		fireEvent.pointerUp(letterButton, {
			button: 0,
			pointerType: "touch",
		});

		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("does not vibrate when the device prefers reduced motion and no preference is set", async () => {
		installMatchMediaMock(true);
		installLocalStorageMock();
		const vibrateMock = installVibrateMock();

		renderDaily();

		const letterButton = screen.getByRole("button", { name: "C" });
		fireEvent.pointerUp(letterButton, {
			button: 0,
			pointerType: "touch",
		});

		expect(vibrateMock).not.toHaveBeenCalled();
	});

	it("vibrates when the user enabled vibration despite reduced motion", async () => {
		installMatchMediaMock(true);
		installLocalStorageMock({ "paraules-vibration-v1": "1" });
		const vibrateMock = installVibrateMock();

		renderDaily();

		const letterButton = screen.getByRole("button", { name: "C" });
		fireEvent.pointerUp(letterButton, {
			button: 0,
			pointerType: "touch",
		});

		expect(vibrateMock).toHaveBeenCalledWith(14);
	});
});
