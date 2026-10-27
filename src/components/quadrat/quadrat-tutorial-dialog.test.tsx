// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HELD_FOUND_WORD_MS } from "@/components/puzzle/puzzle-animation-timing";
import guessWords from "@/data/catalan-guess-words.json";
import { buildNormalizedDictionary } from "@/lib/puzzle-dictionary";
import {
	areAdjacent,
	getCellCol,
	getCellRow,
	getWordFromPath,
	summarizeQuadratPaths,
} from "@/lib/quadrat-board";
import { findQuadratValidGuesses } from "@/lib/quadrat-generator";
import { hasSeenQuadratTutorial } from "@/lib/quadrat-local";
import { QuadratTutorialDialog } from "./quadrat-tutorial-dialog";
import {
	getTutorialBoardState,
	INITIAL_QUADRAT_TUTORIAL_STATE,
	releaseTutorialPath,
	TUTORIAL_GUIDED_WORD,
	TUTORIAL_LAST_WORD,
	TUTORIAL_LETTERS,
	TUTORIAL_VALID_GUESSES,
	TUTORIAL_WORDS,
} from "./quadrat-tutorial-puzzle";

// Matches the board's layout: tiles one unit wide with 0.55-unit gaps.
const PITCH = 1.55;
const SPAN = 4 + 3 * 0.55;
const UNIT_PX = 100;

function Tutorial() {
	const [open, setOpen] = useState(true);
	return (
		<>
			<QuadratTutorialDialog open={open} onOpenChange={setOpen} />
			<button type="button" onClick={() => setOpen(true)}>
				Reobrir
			</button>
		</>
	);
}

function drag(path: readonly number[]) {
	const board = screen.getByRole("group", { name: /Tauler de lletres/ });
	const at = (cell: number) => ({
		clientX: (getCellCol(cell) * PITCH + 0.5) * UNIT_PX,
		clientY: (getCellRow(cell) * PITCH + 0.5) * UNIT_PX,
	});
	const [first, ...rest] = path;
	if (first === undefined) throw new Error("Empty path");
	fireEvent.pointerDown(board, {
		...at(first),
		pointerId: 1,
		pointerType: "touch",
	});
	for (const cell of rest)
		fireEvent.pointerMove(board, { ...at(cell), pointerId: 1 });
	fireEvent.pointerUp(board, { pointerId: 1 });
}

function usesOf(cell: number): string | null {
	return (
		document
			.querySelector(`[data-cell="${cell}"]`)
			?.getAttribute("aria-label") ?? null
	);
}

// The other steps' texts stay in the card, hidden, to hold its height.
function stepTitle() {
	return screen.getByRole("heading", { level: 2 }).textContent;
}

function expectFoundWords(count: number) {
	expect(
		screen
			.getByRole("progressbar", { name: "Paraules trobades" })
			.getAttribute("aria-valuenow"),
	).toBe(String(count));
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		width: SPAN * UNIT_PX,
		height: SPAN * UNIT_PX,
		right: SPAN * UNIT_PX,
		bottom: SPAN * UNIT_PX,
		toJSON: () => ({}),
	});
	// jsdom has no pointer capture.
	HTMLElement.prototype.setPointerCapture = vi.fn();
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Garbuix quadrat tutorial", () => {
	it("guides the first word, then lets the player follow the lines to the last", () => {
		vi.useFakeTimers();
		render(<Tutorial />);
		expectFoundWords(3);
		expect(stepTitle()).toBe("Arrossega per formar PORTA");
		expect(usesOf(9)).toBe("T, 2 paraules");

		// Tapping letters one by one, as on the daily board, does nothing.
		drag([2]);
		expect(
			screen.getByText(
				"Toca la P i, sense aixecar el dit, arrossega'l fins a la O.",
			),
		).toBeTruthy();
		drag([2, 1, 5, 9]);
		expect(
			screen.getByText("Gairebé! Continua fins a la A sense aixecar el dit."),
		).toBeTruthy();
		expectFoundWords(3);

		drag(TUTORIAL_GUIDED_WORD.path);
		expectFoundWords(4);
		expect(stepTitle()).toBe("Els números baixen");
		// The T and A that TAULA still needs drop to 1; PORTA's own letters go out.
		expect(usesOf(9)).toBe("T, 1 paraula");
		expect(usesOf(10)).toBe("A, 1 paraula");
		expect(usesOf(2)).toBe("P, 0 paraules");

		drag([...TUTORIAL_LAST_WORD.path].reverse());
		expect(
			screen.getByText("Al revés! Comença per l'altra punta."),
		).toBeTruthy();
		expectFoundWords(4);

		drag(TUTORIAL_LAST_WORD.path);
		expectFoundWords(5);
		// The last word lights up before the closing step takes over.
		expect(stepTitle()).toBe("Els números baixen");
		act(() => {
			vi.advanceTimersByTime(HELD_FOUND_WORD_MS);
		});
		expect(stepTitle()).toBe("Ja saps jugar a Garbuix quadrat!");
		expect(screen.getByText("7 intents")).toBeTruthy();

		expect(hasSeenQuadratTutorial()).toBe(false);
		fireEvent.click(
			screen.getByRole("button", { name: "Jugar al quadrat d'avui" }),
		);
		expect(hasSeenQuadratTutorial()).toBe(true);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("skips at any step and starts over when reopened", () => {
		render(<Tutorial />);
		drag(TUTORIAL_GUIDED_WORD.path);
		fireEvent.click(screen.getByRole("button", { name: "Saltar el tutorial" }));
		expect(hasSeenQuadratTutorial()).toBe(true);
		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Reobrir" }));
		expectFoundWords(3);
		expect(stepTitle()).toBe("Arrossega per formar PORTA");
	});

	it("coaches a drag shorter than a word without counting it", () => {
		const release = releaseTutorialPath(
			INITIAL_QUADRAT_TUTORIAL_STATE,
			TUTORIAL_GUIDED_WORD.path.slice(0, 3),
		);
		expect(release.feedback).toBeNull();
		expect(release.state.guessCount).toBe(
			INITIAL_QUADRAT_TUTORIAL_STATE.guessCount,
		);
		expect(release.state.message).toMatch(/^Gairebé!/);
	});

	it("asks for PORTA before TAULA", () => {
		const release = releaseTutorialPath(
			INITIAL_QUADRAT_TUTORIAL_STATE,
			TUTORIAL_LAST_WORD.path,
		);
		expect(release.state.foundWordIds).toEqual(
			INITIAL_QUADRAT_TUTORIAL_STATE.foundWordIds,
		);
		expect(release.feedback?.kind).toBe("valid_but_not_in_puzzle");
		expect(release.state.message).toMatch(/^TAULA també hi és/);
	});

	it("spells every word along neighbouring cells, covering the board", () => {
		const covered = new Set<number>();
		for (const word of TUTORIAL_WORDS) {
			expect(getWordFromPath(TUTORIAL_LETTERS, word.path)).toBe(word.answer);
			word.path.slice(1).forEach((cell, index) => {
				expect(areAdjacent(word.path[index] as number, cell)).toBe(true);
			});
			for (const cell of word.path) covered.add(cell);
		}
		expect(covered.size).toBe(TUTORIAL_LETTERS.length);
	});

	it("lists the dictionary words a drag can spell on the tutorial's lines", () => {
		const { connections } = summarizeQuadratPaths([
			TUTORIAL_GUIDED_WORD.path,
			TUTORIAL_LAST_WORD.path,
		]);
		expect(
			findQuadratValidGuesses({
				letters: TUTORIAL_LETTERS,
				connections,
				normalizedWords: buildNormalizedDictionary(guessWords),
				targetWords: TUTORIAL_WORDS.map(({ answer }) => answer),
			}),
		).toEqual(TUTORIAL_VALID_GUESSES);
	});

	it("leaves only TAULA's lines once PORTA is found", () => {
		const { state } = releaseTutorialPath(
			INITIAL_QUADRAT_TUTORIAL_STATE,
			TUTORIAL_GUIDED_WORD.path,
		);
		const board = getTutorialBoardState(state);
		const lines = [...board.connectionUses]
			.filter(([, uses]) => uses > 0)
			.map(([key]) => key)
			.sort();
		expect(lines).toEqual(
			summarizeQuadratPaths([TUTORIAL_LAST_WORD.path])
				.connections.map(({ cells: [left, right] }) => `${left}-${right}`)
				.sort(),
		);
	});
});
