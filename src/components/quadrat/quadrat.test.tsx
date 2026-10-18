// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getCellCol, getCellRow, getWordFromPath } from "@/lib/quadrat-board";
import { markQuadratTutorialSeen, readQuadratSaves } from "@/lib/quadrat-local";
import { getQuadratClues } from "@/lib/quadrat-server-fns";
import type {
	QuadratPuzzlePrivate,
	QuadratPuzzlePublic,
} from "@/lib/quadrat-types";
import { quadratFixture } from "@/test/quadrat-fixture";
import { Quadrat } from "./quadrat";
import {
	setQuadratTutorialOpen,
	useQuadratTutorialOpen,
} from "./quadrat-tutorial-store";

vi.mock("@/lib/quadrat-server-fns", () => ({
	getQuadratPageData: vi.fn(),
	syncQuadratProgress: vi.fn(),
	getQuadratClues: vi.fn(),
}));

// Matches the board's layout: tiles one unit wide with 0.55-unit gaps.
const PITCH = 1.55;
const SPAN = 4 + 3 * 0.55;
const UNIT_PX = 100;

let puzzle: QuadratPuzzlePublic;
let privateSnapshot: QuadratPuzzlePrivate;

beforeAll(async () => {
	({ puzzle, privateSnapshot } = await quadratFixture());
});

beforeEach(() => {
	vi.mocked(getQuadratClues).mockResolvedValue({ kind: "ok", clues: {} });
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
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
	setQuadratTutorialOpen(false);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function stubDesktopLayout() {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query === "(min-width: 1024px)",
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
}

function renderQuadrat() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return render(
		<Quadrat
			initialData={{
				puzzle,
				progress: null,
				userId: null,
				rolloverAt: new Date(Date.now() + 60_000).toISOString(),
			}}
		/>,
		{ wrapper },
	);
}

function centerOf(cell: number) {
	return {
		clientX: (getCellCol(cell) * PITCH + 0.5) * UNIT_PX,
		clientY: (getCellRow(cell) * PITCH + 0.5) * UNIT_PX,
	};
}

function drag(board: HTMLElement, path: readonly number[], release = true) {
	const [first, ...rest] = path;
	if (first === undefined) throw new Error("Empty path");
	fireEvent.pointerDown(board, {
		...centerOf(first),
		pointerId: 1,
		pointerType: "touch",
	});
	for (const cell of rest) {
		fireEvent.pointerMove(board, { ...centerOf(cell), pointerId: 1 });
	}
	if (release) fireEvent.pointerUp(board, { pointerId: 1 });
}

function usesOf(cell: number): number {
	const label =
		document
			.querySelector(`[data-cell="${cell}"]`)
			?.getAttribute("aria-label") ?? "";
	return Number(label.match(/(\d+) paraul/)?.[1] ?? 0);
}

it("finds a word by dragging, lowers its letters' counts and saves it", async () => {
	const { container } = renderQuadrat();
	const board = await screen.findByRole("group", { name: /Tauler de lletres/ });
	const [word] = privateSnapshot.words;
	if (!word) throw new Error("Fixture has no words");
	const usesBefore = word.path.map(usesOf);
	const currentGuess = () =>
		container.querySelector('[data-slot="current-guess"]')?.textContent;

	drag(board, word.path, false);
	expect(currentGuess()).toBe(
		getWordFromPath(puzzle.letters, word.path).toUpperCase(),
	);
	fireEvent.pointerUp(board, { pointerId: 1 });

	// The found word stays over the panel in green.
	await waitFor(() => {
		const feedback = container.querySelector('[data-slot="submit-feedback"]');
		expect(feedback?.getAttribute("data-feedback-kind")).toBe("new_word");
		expect(feedback?.classList.contains("held-found-word")).toBe(true);
	});
	// The meter follows the decoded progress, which can land a beat later.
	await waitFor(() =>
		expect(
			screen
				.getByRole("progressbar", { name: "Paraules trobades" })
				.getAttribute("aria-valuenow"),
		).toBe("1"),
	);
	// The word's tiles light up in green while it shows.
	for (const cell of word.path) {
		expect(
			document
				.querySelector(`[data-cell="${cell}"]`)
				?.classList.contains("quadrat-found-cell"),
		).toBe(true);
	}

	// On a phone the list waits in a sheet under the board.
	fireEvent.click(
		screen.getByRole("button", {
			name: `Paraules, 1 de ${puzzle.wordSlots.length} trobades`,
		}),
	);
	const sheet = await screen.findByRole("dialog", { name: "Paraules" });
	expect(within(sheet).getByText(word.displayWord.toUpperCase())).toBeTruthy();
	await waitFor(() =>
		expect(word.path.map(usesOf)).toEqual(usesBefore.map((uses) => uses - 1)),
	);
	expect(readQuadratSaves(null)[puzzle.dateKey]?.guessedWordIds).toEqual([
		word.id,
	]);
});

it("keeps a drag on drawn connections and away from visited letters", async () => {
	const { container } = renderQuadrat();
	const board = await screen.findByRole("group", { name: /Tauler de lletres/ });
	const [word] = privateSnapshot.words;
	if (!word) throw new Error("Fixture has no words");
	const [first, second] = word.path as [number, number];
	const drawn = new Set(
		puzzle.connections.map(({ cells: [left, right] }) => `${left}-${right}`),
	);
	const isDrawn = (left: number, right: number) =>
		drawn.has(`${Math.min(left, right)}-${Math.max(left, right)}`);
	const neighbours = Array.from({ length: 16 }, (_, cell) => cell).filter(
		(cell) =>
			cell !== first &&
			Math.abs(getCellRow(cell) - getCellRow(first)) <= 1 &&
			Math.abs(getCellCol(cell) - getCellCol(first)) <= 1,
	);
	const undrawn = neighbours.find((cell) => !isDrawn(first, cell));
	const currentGuess = () =>
		container.querySelector('[data-slot="current-guess"]')?.textContent;

	if (undrawn !== undefined) {
		drag(board, [first, undrawn], false);
		expect(currentGuess()).toBe(puzzle.letters[first]?.toUpperCase());
		fireEvent.pointerUp(board, { pointerId: 1 });
	}

	// Moving back onto the previous letter undoes the last step.
	drag(board, [first, second, first], false);
	expect(currentGuess()).toBe(puzzle.letters[first]?.toUpperCase());
	fireEvent.pointerUp(board, { pointerId: 1 });
});

it("spends a clue on an unfound word and marks where it starts", async () => {
	stubDesktopLayout();
	vi.mocked(getQuadratClues).mockImplementation(async ({ data }) => ({
		kind: "ok",
		clues: Object.fromEntries(
			data.wordIds.map((id) => [id, `Pista de la paraula ${id}.`]),
		),
	}));
	renderQuadrat();
	await screen.findByRole("group", { name: /Tauler de lletres/ });

	// Keyboard activation skips the hold.
	fireEvent.click(screen.getByRole("button", { name: /Pista \(3\)/ }));

	const saved = await waitFor(() => {
		const progress = readQuadratSaves(null)[puzzle.dateKey];
		expect(progress?.clueWordIds).toHaveLength(1);
		return progress;
	});
	const cluedId = saved?.clueWordIds[0];
	const clued = privateSnapshot.words.find(({ id }) => id === cluedId);
	if (!clued) throw new Error("Clue went to an unknown word");

	// The label follows the decoded progress, which can land a beat later.
	await screen.findByRole("button", { name: /Pista \(2\)/ });
	await waitFor(() =>
		expect(
			document
				.querySelector(`[data-cell="${clued.path[0]}"]`)
				?.classList.contains("clue-gradient-cell"),
		).toBe(true),
	);
	const list = screen.getByRole("region", { name: "Paraules del dia" });
	await within(list).findByText(`Pista de la paraula ${clued.id}.`);
	expect(within(list).getAllByText(/Per descobrir/)).toHaveLength(1);
});

it("keeps the word list beside the board on a desktop", async () => {
	stubDesktopLayout();
	renderQuadrat();
	await screen.findByRole("group", { name: /Tauler de lletres/ });

	expect(screen.getByRole("region", { name: "Paraules del dia" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: /^Paraules/ })).toBeNull();
});

function TutorialProbe() {
	return useQuadratTutorialOpen() ? <p>Tutorial obert</p> : null;
}

it("opens the tutorial until the player finishes or skips it", async () => {
	renderQuadrat();
	render(<TutorialProbe />);
	await screen.findByRole("group", { name: /Tauler de lletres/ });
	expect(screen.getByText("Tutorial obert")).toBeTruthy();

	cleanup();
	setQuadratTutorialOpen(false);
	markQuadratTutorialSeen();
	renderQuadrat();
	render(<TutorialProbe />);
	await screen.findByRole("group", { name: /Tauler de lletres/ });
	expect(screen.queryByText("Tutorial obert")).toBeNull();
});
