// @vitest-environment jsdom

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeMiniSave } from "@/lib/mini-local";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import { getPlayedOtherGames } from "@/lib/puzzle-server-fns";
import { writeQuadratSave } from "@/lib/quadrat-local";
import { writeSyllableSave } from "@/lib/syllable-local";
import { WinDialog } from "./win-dialog";

vi.mock("@/lib/puzzle-server-fns", () => ({
	getPlayedOtherGames: vi.fn(),
}));

// Already April 11 in Madrid.
const completedAt = "2026-04-10T22:30:00.000Z";
const completionDay = "2026-04-11";

beforeEach(() => {
	const saves = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => saves.get(key) ?? null,
		setItem: (key: string, value: string) => saves.set(key, value),
	});
	vi.mocked(getPlayedOtherGames).mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderWinDialog(userId: string | null = null) {
	const props = {
		open: true,
		onOpenChange: () => {},
		guessCount: 16,
		hintsUsed: 0,
		completedAt,
		currentStreak: 1,
		userId,
		onSignIn: () => {},
	};
	const root = createRootRoute();
	const home = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => <WinDialog {...props} />,
	});
	const router = createRouter({
		routeTree: root.addChildren([home]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	render(<RouterProvider router={router} />);
}

function emptyProgress(id: string) {
	return createEmptyProgressState({ id, initialShuffledLetters: [] });
}

async function expectRecommendations(paths: string[]) {
	const dialog = await screen.findByRole("alertdialog");
	await waitFor(() => {
		const games = within(dialog).queryByRole("navigation", {
			name: "Altres jocs",
		});
		if (paths.length === 0) {
			expect(games).toBeNull();
			return;
		}
		const links = games ? within(games).getAllByRole("link") : [];
		expect(links.map((link) => link.getAttribute("href"))).toEqual(paths);
	});
}

it("uses the Madrid date of the Classic finish and recommends untouched games in order", async () => {
	writeQuadratSave(null, "2026-04-10", {
		...emptyProgress("quadrat:2026-04-10"),
		guessCount: 1,
	});
	writeMiniSave(null, completionDay, {
		...emptyProgress(`mini:${completionDay}`),
		hintsUsed: 1,
	});
	writeSyllableSave(
		null,
		completionDay,
		emptyProgress(`syllable:${completionDay}`),
	);

	renderWinDialog();
	await expectRecommendations(["/quadrat", "/sillabes"]);
});

it("combines browser saves and synced progress for the active account", async () => {
	writeMiniSave("player", completionDay, {
		...emptyProgress(`mini:${completionDay}`),
		guessCount: 1,
	});
	writeSyllableSave("another-player", completionDay, {
		...emptyProgress(`syllable:${completionDay}`),
		completedAt,
	});
	vi.mocked(getPlayedOtherGames).mockResolvedValue({
		userId: "player",
		played: { quadrat: true, mini: false, syllables: false },
	});

	renderWinDialog("player");
	await waitFor(() => {
		expect(getPlayedOtherGames).toHaveBeenCalledWith({
			data: { dateKey: completionDay },
		});
	});
	await expectRecommendations(["/sillabes"]);
});

it("hides the section when all games were played, including before signing in", async () => {
	writeQuadratSave(null, completionDay, {
		...emptyProgress(`quadrat:${completionDay}`),
		guessCount: 1,
	});
	writeMiniSave("player", completionDay, {
		...emptyProgress(`mini:${completionDay}`),
		hintsUsed: 1,
	});
	writeSyllableSave("player", completionDay, {
		...emptyProgress(`syllable:${completionDay}`),
		completedAt,
	});

	renderWinDialog("player");
	await expectRecommendations([]);
	expect(getPlayedOtherGames).not.toHaveBeenCalled();
});
