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
import { normalizeWord } from "@/lib/puzzle-text";
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
	fireEvent.click(within(group).getByRole("button", { name: "Pista" }));
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
