// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readMiniSaves } from "@/lib/mini-local";
import { getSlotCellKey } from "@/lib/puzzle-helpers";
import { normalizeWord } from "@/lib/puzzle-text";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getSyllableCells } from "@/lib/syllable-generator";
import { readSyllableSaves } from "@/lib/syllable-local";
import { syllableFixture } from "@/test/syllable-fixture";
import { Syllable } from "./syllable";

vi.mock("@/lib/syllable-server-fns", () => ({
	getSyllablePageData: vi.fn(),
	syncSyllableProgress: vi.fn(),
}));

beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("plays with syllable buttons, deletes a whole syllable, saves extras, and locks the completed game on reload", async () => {
	const { puzzle, crossword } = await syllableFixture();
	const data = {
		puzzle,
		progress: null,
		userId: null,
		rolloverAt: new Date(Date.now() + 60_000).toISOString(),
	};
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: ["/sillabes/"] }),
	});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>
			<RouterContextProvider router={router}>{children}</RouterContextProvider>
		</QueryClientProvider>
	);
	const { unmount, container } = render(<Syllable initialData={data} />, {
		wrapper,
	});
	const group = await screen.findByRole("group", { name: "Forma una paraula" });
	const input = () =>
		container.querySelector('[data-slot="current-guess"]')?.textContent;
	const press = (cell: string) =>
		fireEvent.click(
			within(group).getByRole("button", {
				name: cell.toUpperCase(),
			}),
		);
	expect(container.querySelectorAll('[data-slot="letter-key"]')).toHaveLength(
		6,
	);
	press("pi");
	press("la");
	expect(input()).toBe("PI · LA");
	fireEvent.click(within(group).getByRole("button", { name: "Esborrar" }));
	expect(input()).toBe("PI");
	fireEvent.click(within(group).getByRole("button", { name: "Esborrar" }));
	// The first word typed below fills this cell anyway, so the hint finishes
	// no word ahead of its turn.
	const hinted = pinNextHint(puzzle, getSlotCellKey(crossword.words[0], 0));
	fireEvent.click(within(group).getByRole("button", { name: "Pista" }));
	hinted.mockRestore();
	await waitFor(() =>
		expect(container.querySelectorAll("[data-cell-key] span")).toHaveLength(1),
	);
	expect(readSyllableSaves(null)[puzzle.dateKey].hintsUsed).toBe(1);
	const targetWords = new Set(
		crossword.words.map(({ word }) => normalizeWord(word.name)),
	);
	const extra = puzzle.validSyllableGuesses.find(
		(word) => !targetWords.has(word.replaceAll("|", "")),
	);
	if (!extra) throw new Error("Missing test extra");
	for (const cell of extra.split("|")) press(cell);
	fireEvent.click(within(group).getByRole("button", { name: "Comprovar" }));
	await waitFor(() =>
		expect(readSyllableSaves(null)[puzzle.dateKey].bonusWordsFound).toBe(1),
	);
	expect(screen.queryByRole("region", { name: "Paraules extra" })).toBeNull();
	for (const [index, { word }] of crossword.words.entries()) {
		for (const cell of getSyllableCells(word).map(normalizeWord)) press(cell);
		fireEvent.click(within(group).getByRole("button", { name: "Comprovar" }));
		await screen.findByRole("img", {
			name: `${index + 1} de 5 paraules trobades`,
		});
	}
	await screen.findByRole(
		"heading",
		{ name: "Les has trobades totes!" },
		{ timeout: 3000 },
	);
	expect(screen.queryByRole("group", { name: "Forma una paraula" })).toBeNull();
	const completedWords = screen.getByRole("region", {
		name: "Paraules trobades",
	});
	await within(completedWords).findByText(
		puzzle.displayWords[extra.replaceAll("|", "")].toUpperCase(),
	);
	expect(within(completedWords).getAllByRole("list")).toHaveLength(1);
	expect(within(completedWords).getAllByRole("listitem")).toHaveLength(6);
	expect(screen.queryByRole("region", { name: "Paraules extra" })).toBeNull();
	expect(
		screen.queryByRole("link", { name: "Veure el meu progrés" }),
	).toBeNull();
	expect(readMiniSaves(null)).toEqual({});
	expect(readSyllableSaves(null)[puzzle.dateKey].guessedWordIds).toHaveLength(
		5,
	);
	unmount();
	render(<Syllable initialData={data} />, { wrapper });
	await screen.findByRole("heading", { name: "Les has trobades totes!" });
	expect(screen.queryByRole("button", { name: "Comprovar" })).toBeNull();
});

it("finds a word spelled by a hint and a crossing word, without a try", async () => {
	const { puzzle, crossword } = await syllableFixture();
	const placement = (name: string) => {
		const found = crossword.words.find(({ word }) => word.name === name);
		if (!found) throw new Error(`Missing ${name} in the syllable fixture`);
		return found;
	};
	render(
		<Syllable
			initialData={{
				puzzle,
				progress: null,
				userId: null,
				rolloverAt: new Date(Date.now() + 60_000).toISOString(),
			}}
		/>,
	);
	const group = await screen.findByRole("group", { name: "Forma una paraula" });
	// "pela" is its own "pe" plus the "la" that ends "pila".
	const hinted = pinNextHint(puzzle, getSlotCellKey(placement("pela"), 0));
	fireEvent.click(within(group).getByRole("button", { name: "Pista" }));
	hinted.mockRestore();
	for (const cell of getSyllableCells(placement("pila").word))
		fireEvent.click(
			within(group).getByRole("button", { name: cell.toUpperCase() }),
		);
	fireEvent.click(within(group).getByRole("button", { name: "Comprovar" }));

	await screen.findByRole("img", { name: "2 de 5 paraules trobades" });
	await screen.findByRole("button", {
		name: "PELA, trobada. Mostra al tauler.",
	});
	const saved = readSyllableSaves(null)[puzzle.dateKey];
	expect(saved.guessedWordIds).toEqual([
		placement("pila").id,
		placement("pela").id,
	]);
	expect(saved.guessCount).toBe(1);
});

// Hints pick a hidden cell at random. Makes the next one land on this cell
// while the whole board is still hidden.
function pinNextHint(puzzle: DailyPuzzlePublic, cellKey: string) {
	const index = puzzle.hintCapsules.findIndex(
		(capsule) => capsule.cellKey === cellKey,
	);
	if (index < 0) throw new Error(`No hint capsule for cell ${cellKey}`);
	return vi
		.spyOn(Math, "random")
		.mockReturnValue((index + 0.5) / puzzle.hintCapsules.length);
}
