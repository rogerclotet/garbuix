// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getMiniDictionary } from "@/lib/mini-dictionary.server";
import { generateMiniCrossword } from "@/lib/mini-generator";
import { readMiniSaves, writeMiniSave } from "@/lib/mini-local";
import { applyMiniEvent } from "@/lib/mini-progress";
import { syncMiniProgress } from "@/lib/mini-server-fns";
import { createPuzzleEvent, resolveGuess } from "@/lib/puzzle-client";
import { getWordCellKeys } from "@/lib/puzzle-helpers";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import { normalizeWord } from "@/lib/puzzle-text";
import { Mini, type MiniPageData } from "./mini";

vi.mock("@/lib/mini-server-fns", () => ({
	getMiniPageData: vi.fn(),
	syncMiniProgress: vi.fn(),
}));

beforeEach(() => {
	// Keep frame timestamps on the same clock as performance.now() in jsdom.
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
		window.setTimeout(() => callback(performance.now()), 16),
	);
	vi.stubGlobal("cancelAnimationFrame", (id: number) =>
		window.clearTimeout(id),
	);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.mocked(syncMiniProgress).mockReset();
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

it("requires a full clue hold, cancels early release, and keeps keyboard activation", async () => {
	const { data } = await fixture();
	render(<Mini initialData={data} />);
	const hint = await screen.findByRole("button", { name: "Pista" });
	hint.setPointerCapture = vi.fn();
	vi.useFakeTimers();

	fireEvent.pointerDown(hint, { pointerType: "touch", pointerId: 1 });
	await act(() => vi.advanceTimersByTimeAsync(200));
	fireEvent.pointerUp(hint);
	fireEvent.click(hint, { detail: 1 });
	await act(() => vi.advanceTimersByTimeAsync(700));
	expect(readMiniSaves(null)[data.puzzle.dateKey]?.hintsUsed ?? 0).toBe(0);

	fireEvent.pointerDown(hint, { pointerType: "touch", pointerId: 2 });
	await act(() => vi.advanceTimersByTimeAsync(700));
	fireEvent.pointerUp(hint);
	fireEvent.click(hint, { detail: 1 });
	expect(readMiniSaves(null)[data.puzzle.dateKey]?.hintsUsed).toBe(1);
	vi.useRealTimers();
	await waitFor(() => {
		expect(document.querySelectorAll("[data-cell-key] span")).toHaveLength(1);
	});

	fireEvent.click(hint, { detail: 0 });
	await waitFor(() => {
		expect(document.querySelectorAll("[data-cell-key] span")).toHaveLength(2);
	});
});

it("colors submitted words, flies correct letters into the board, and clears feedback on typing", async () => {
	const { data, word } = await fixture();
	const { container } = render(<Mini initialData={data} />);
	await screen.findByRole("group", { name: "Forma una paraula" });
	for (const letter of word) fireEvent.keyDown(window, { key: letter });
	fireEvent.keyDown(window, { key: "Enter" });
	await waitFor(() => {
		expect(
			container.querySelector('[data-feedback-kind="new_word"]')?.className,
		).toContain("text-teal-600");
	});
	await waitFor(() => {
		expect(container.querySelectorAll("[data-flying-letter]")).toHaveLength(
			word.length,
		);
	});
	const slot = data.puzzle.wordSlots[0];
	for (const key of getWordCellKeys(slot)) {
		expect(
			container.querySelector(`[data-cell-key="${key}"]`)?.textContent,
		).toBe("");
	}
	await waitFor(
		() => {
			expect(container.querySelectorAll("[data-flying-letter]")).toHaveLength(
				0,
			);
		},
		{ timeout: 2000 },
	);
	for (const key of getWordCellKeys(slot)) {
		expect(
			container.querySelector(`[data-cell-key="${key}"]`)?.textContent,
		).toMatch(/[A-ZÀ-Ü]/);
	}

	for (const letter of word) fireEvent.keyDown(window, { key: letter });
	fireEvent.keyDown(window, { key: "Enter" });
	await waitFor(() => {
		expect(
			container.querySelector('[data-feedback-kind="already_found"]')
				?.className,
		).toContain("text-muted-foreground");
	});
	expect(container.querySelector("[data-flying-letter]")).toBeNull();

	const invalidWord = data.puzzle.letters[0].repeat(3);
	for (const letter of invalidWord) fireEvent.keyDown(window, { key: letter });
	expect(container.querySelector('[data-slot="submit-feedback"]')).toBeNull();
	fireEvent.keyDown(window, { key: "Enter" });
	await waitFor(() => {
		expect(
			container.querySelector('[data-feedback-kind="not_in_dictionary"]')
				?.className,
		).toContain("text-destructive");
	});
	expect(container.querySelector("[data-flying-letter]")).toBeNull();
});

async function fixture() {
	const generated = generateMiniCrossword("2026-01-01");
	const { publicSnapshot: puzzle, privateSnapshot } =
		await buildPuzzleSnapshots({
			...generated,
			initialShuffledLetters: generated.shuffledLetters,
			dateKey: "2026-01-01",
			seed: 260101,
			puzzleId: "mini:2026-01-01",
			algorithmVersion: "mini-v1",
		});
	const empty = createEmptyProgressState(puzzle);
	const word = privateSnapshot.wordSlots[0].displayWord;
	const guess = await resolveGuess({ puzzle, progress: empty, guess: word });
	const found = applyMiniEvent(
		puzzle,
		empty,
		createPuzzleEvent("guess_added", {
			guessHash: guess.guessHash,
			matchedWordId: guess.matchedSlotId,
			unlockToken: guess.unlockToken,
		}),
	);
	const progress = applyMiniEvent(
		puzzle,
		found,
		createPuzzleEvent("hint_used", {
			cellKey: puzzle.hintCapsules[0].cellKey,
		}),
	);
	const data: MiniPageData = {
		puzzle: { ...puzzle, ...getMiniDictionary(puzzle.letters) },
		progress: null,
		userId: null,
		rolloverAt: new Date(Date.now() + 60_000).toISOString(),
	};
	return {
		data,
		progress,
		word,
		words: privateSnapshot.wordSlots.map((slot) => slot.displayWord),
	};
}

it.each(["guest", "account"])(
	"keeps the board hidden until saved %s progress and letters are ready",
	async (source) => {
		const { data, progress, word } = await fixture();
		if (source === "guest") writeMiniSave(null, data.puzzle.dateKey, progress);
		else {
			data.userId = "parent";
			data.progress = progress;
		}

		const html = renderToString(<Mini initialData={data} />);
		expect(html).toContain('role="status"');
		expect(html).not.toContain("data-cell-key");
		expect(html).not.toContain("paraules trobades");

		const { container } = render(<Mini initialData={data} />);
		expect(
			screen.getByRole("heading", {
				name:
					source === "guest"
						? "Carregant el repte d'avui"
						: "Sincronitzant el teu progrés",
			}),
		).toBeTruthy();
		expect(container.querySelector("[data-cell-key]")).toBeNull();
		expect(
			screen.queryByRole("group", { name: "Forma una paraula" }),
		).toBeNull();

		await screen.findByRole("button", {
			name: `${word.toUpperCase()}, trobada. Mostra al tauler.`,
		});
		expect(
			screen.getByRole("img", { name: "1 de 5 paraules trobades" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("heading", { name: /Carregant|Sincronitzant/ }),
		).toBeNull();
		const hintKey = progress.hintedCells[0];
		expect(
			container.querySelector(`[data-cell-key="${hintKey}"]`)?.textContent,
		).toMatch(/[A-ZÀ-Ü]/);
	},
);

it("shows a playable empty board for a new player", async () => {
	const { data } = await fixture();
	render(<Mini initialData={data} />);
	await screen.findByRole("group", { name: "Forma una paraula" });
	expect(
		screen.getByRole("img", { name: "0 de 5 paraules trobades" }),
	).toBeTruthy();
	expect(
		screen.queryByRole("heading", { name: /Carregant|Sincronitzant/ }),
	).toBeNull();
});

it("disables one- and two-letter submissions and caps typing and tapping at five letters", async () => {
	const { data } = await fixture();
	const { container } = render(<Mini initialData={data} />);
	const group = await screen.findByRole("group", { name: "Forma una paraula" });
	const submit = within(group).getByRole("button", { name: "Comprovar" });
	const letter = data.puzzle.letters[0];
	const key = within(group).getByRole("button", { name: letter.toUpperCase() });
	for (let length = 1; length <= 2; length++) {
		fireEvent.click(key);
		expect(submit.hasAttribute("disabled")).toBe(true);
		fireEvent.keyDown(window, { key: "Enter" });
		expect(readMiniSaves(null)[data.puzzle.dateKey]).toBeUndefined();
	}
	fireEvent.keyDown(window, { key: letter });
	expect(submit.hasAttribute("disabled")).toBe(false);
	for (let index = 0; index < 4; index++) fireEvent.click(key);
	fireEvent.keyDown(window, { key: letter });
	expect(
		container.querySelector('[data-slot="current-guess"]')?.textContent,
	).toBe(letter.toUpperCase().repeat(5));
	expect(submit.hasAttribute("disabled")).toBe(false);
});

it("offers a retry without showing an empty board if saved letters fail to decode", async () => {
	const { data, progress, word } = await fixture();
	writeMiniSave(null, data.puzzle.dateKey, progress);
	const digest = vi
		.spyOn(crypto.subtle, "digest")
		.mockRejectedValueOnce(new Error("decode failed"));
	const { container } = render(<Mini initialData={data} />);
	await screen.findByRole("heading", {
		name: "No s'ha pogut carregar el progrés",
	});
	expect(container.querySelector("[data-cell-key]")).toBeNull();
	expect(
		screen.getByRole("heading", { name: "No s'ha pogut carregar el progrés" }),
	).toBeTruthy();
	digest.mockRestore();
	fireEvent.click(screen.getByRole("button", { name: "Torna-ho a provar" }));
	await screen.findByRole("button", {
		name: `${word.toUpperCase()}, trobada. Mostra al tauler.`,
	});
});

it("plays Mini through hints, shuffles, completion, and restoring a finished save", async () => {
	const { data, words } = await fixture();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: ["/mini/"] }),
	});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>
			<RouterContextProvider router={router}>{children}</RouterContextProvider>
		</QueryClientProvider>
	);
	renderToString(<Mini initialData={data} />);

	const { unmount } = render(<Mini initialData={data} />, {
		wrapper,
	});
	await screen.findByRole("group", { name: "Forma una paraula" });
	fireEvent.click(screen.getByRole("button", { name: "Barrejar" }));
	fireEvent.click(screen.getByRole("button", { name: "Pista" }));
	const targets = new Set(words.map(normalizeWord));
	const extra = data.puzzle.validNormalizedGuesses.find(
		(word) => word.length === 5 && !targets.has(word),
	);
	if (!extra) throw new Error("Missing Mini extra in fixture");
	for (let attempt = 0; attempt < 2; attempt++) {
		for (const letter of extra) fireEvent.keyDown(window, { key: letter });
		fireEvent.keyDown(window, { key: "Enter" });
		await waitFor(() =>
			expect(readMiniSaves(null)[data.puzzle.dateKey].bonusWordsFound).toBe(1),
		);
		await waitFor(() =>
			expect(
				document.querySelector('[data-slot="current-guess"]')?.textContent,
			).toBe(""),
		);
	}
	expect(readMiniSaves(null)[data.puzzle.dateKey].guessCount).toBe(1);
	expect(
		screen.queryByRole("region", { name: "Paraules trobades" }),
	).toBeNull();
	for (const [index, word] of words.entries()) {
		for (const letter of word) fireEvent.keyDown(window, { key: letter });
		fireEvent.keyDown(window, { key: "Enter" });
		// Repeated Enter must not submit the same guess twice.
		fireEvent.keyDown(window, { key: "Enter" });
		await screen.findByRole("img", {
			name: `${index + 1} de 5 paraules trobades`,
		});
	}
	// Completing the save must not remove the source or resize the board mid-flight.
	expect(
		screen.queryByRole("heading", { name: "Les has trobades totes!" }),
	).toBeNull();
	expect(
		screen
			.getByRole("group", { name: "Forma una paraula" })
			.hasAttribute("disabled"),
	).toBe(true);
	await waitFor(() => {
		expect(document.querySelector("[data-flying-letter]")).not.toBeNull();
	});
	expect(
		screen.queryByRole("heading", { name: "Les has trobades totes!" }),
	).toBeNull();
	await screen.findByRole(
		"heading",
		{ name: "Les has trobades totes!" },
		{ timeout: 2000 },
	);
	expect(document.querySelector("[data-flying-letter]")).toBeNull();
	const completedWords = screen.getByRole("region", {
		name: "Paraules trobades",
	});
	expect(await within(completedWords).findAllByRole("listitem")).toHaveLength(
		6,
	);
	await within(completedWords).findByText(
		data.puzzle.displayWords[extra].toUpperCase(),
	);
	expect(
		screen.queryByRole("link", { name: "Veure el meu progrés" }),
	).toBeNull();
	unmount();
	render(<Mini initialData={data} />, { wrapper });
	await screen.findByRole("heading", { name: "Les has trobades totes!" });
	expect(readMiniSaves(null)[data.puzzle.dateKey].bonusWordsFound).toBe(1);
	await within(
		screen.getByRole("region", { name: "Paraules trobades" }),
	).findByText(data.puzzle.displayWords[extra].toUpperCase());
});

it("reveals a correct word without flying letters when reduced motion is requested", async () => {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query === "(prefers-reduced-motion: reduce)",
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
	const { data, word } = await fixture();
	const { container } = render(<Mini initialData={data} />);
	await screen.findByRole("group", { name: "Forma una paraula" });
	for (const letter of word) fireEvent.keyDown(window, { key: letter });
	fireEvent.keyDown(window, { key: "Enter" });
	await screen.findByRole("img", { name: "1 de 5 paraules trobades" });
	expect(
		container
			.querySelector('[data-slot="submit-feedback"]')
			?.getAttribute("data-reduced-motion"),
	).toBe("true");
	for (const key of getWordCellKeys(data.puzzle.wordSlots[0])) {
		expect(
			container.querySelector(`[data-cell-key="${key}"]`)?.textContent,
		).toMatch(/[A-ZÀ-Ü]/);
	}
	expect(container.querySelector("[data-flying-letter]")).toBeNull();
	await waitFor(() =>
		expect(container.querySelector('[data-slot="submit-feedback"]')).toBeNull(),
	);
});

it("syncs saved Mini progress for a signed-in player", async () => {
	const { data, progress } = await fixture();
	data.userId = "private-user";
	writeMiniSave(data.userId, data.puzzle.dateKey, progress);
	vi.mocked(syncMiniProgress).mockResolvedValue({
		...progress,
		clueWordIds: [],
		lastSyncedAt: new Date().toISOString(),
	});
	render(<Mini initialData={data} />);

	await waitFor(() => expect(syncMiniProgress).toHaveBeenCalled());
	expect(
		vi.mocked(syncMiniProgress).mock.calls[0][0].data.guessedWordIds,
	).toEqual(progress.guessedWordIds);
});

it("keeps Mini progress locally when sync fails", async () => {
	const { data, progress } = await fixture();
	data.userId = "private-user";
	writeMiniSave(data.userId, data.puzzle.dateKey, progress);
	vi.mocked(syncMiniProgress).mockRejectedValue(new Error("offline"));
	render(<Mini initialData={data} />);
	await screen.findByText(
		"Progrés desat al navegador. Es sincronitzarà quan torni la connexió.",
	);
});
