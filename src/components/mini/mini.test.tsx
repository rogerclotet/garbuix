// @vitest-environment jsdom

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
} from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateMiniCrossword } from "@/lib/mini-generator";
import { writeMiniSave } from "@/lib/mini-local";
import { applyMiniEvent } from "@/lib/mini-progress";
import { syncMiniProgress } from "@/lib/mini-server-fns";
import { createPuzzleEvent, resolveGuess } from "@/lib/puzzle-client";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import { Mini, type MiniPageData } from "./mini";

vi.mock("@/lib/mini-server-fns", () => ({
	getMiniPageData: vi.fn(),
	syncMiniProgress: vi.fn(),
}));

beforeEach(() => {
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
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
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
			availableWordCount: 5,
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
		puzzle,
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
	const wrapper = ({ children }: { children: ReactNode }) => (
		<RouterContextProvider router={router}>{children}</RouterContextProvider>
	);
	renderToString(<Mini initialData={data} />);

	const { unmount } = render(<Mini initialData={data} />, {
		wrapper,
	});
	await screen.findByRole("group", { name: "Forma una paraula" });
	fireEvent.click(screen.getByRole("button", { name: "Barrejar" }));
	fireEvent.click(screen.getByRole("button", { name: "Pista" }));
	for (const [index, word] of words.entries()) {
		for (const letter of word) fireEvent.keyDown(window, { key: letter });
		fireEvent.keyDown(window, { key: "Enter" });
		// Repeated Enter must not submit the same guess twice.
		fireEvent.keyDown(window, { key: "Enter" });
		await screen.findByRole("img", {
			name: `${index + 1} de 5 paraules trobades`,
		});
	}
	unmount();
	render(<Mini initialData={data} />, { wrapper });
	await screen.findByRole("heading", { name: "Les has trobades totes!" });
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
