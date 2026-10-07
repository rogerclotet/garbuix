// @vitest-environment jsdom
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withGameHistory } from "@/lib/game-history";
import Header from "./header";

vi.mock("@/lib/use-active-session-user", () => ({
	useActiveSessionUser: () => ({
		activeUser: null,
		session: { isPending: false },
	}),
}));
vi.mock("@/lib/use-clue-requests", () => ({
	useClueRequests: () => ({ incomingRequests: [] }),
}));
vi.mock("@/components/daily/how-to-play-dialog", () => ({
	HowToPlayDialog: () => null,
}));
vi.mock("@/components/mini/mini-help-dialog", () => ({
	MiniHelpDialog: () => null,
}));
vi.mock("@/components/profile-preferences-tip-dialog", () => ({
	ProfilePreferencesTipDialog: () => null,
}));

beforeEach(() => {
	vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

async function setup(initialEntry = "/") {
	const root = createRootRoute({
		loader: () => ({ sessionUser: null }),
		component: Header,
	});
	const routeTree = root.addChildren(
		["/", "/mini", "/mini/dies-anteriors", "/preferencies", "/privacitat"].map(
			(path) => createRoute({ getParentRoute: () => root, path }),
		),
	);
	const history = createMemoryHistory({ initialEntries: [initialEntry] });
	const router = createRouter({ routeTree, history: withGameHistory(history) });
	render(<RouterProvider router={router} />);
	await screen.findByRole("button", { name: "Obrir el menú" });
	return router;
}

async function switchGame(name: "Garbuix!" | "Garbuix mini") {
	fireEvent.pointerDown(screen.getByRole("button", { name: "Obrir el menú" }), {
		button: 0,
		ctrlKey: false,
		pointerType: "mouse",
	});
	fireEvent.click(await screen.findByRole("menuitem", { name }));
}

it("returns to the original Garbuix entry after repeated game switches", async () => {
	const router = await setup();
	for (let visit = 0; visit < 3; visit++) {
		await switchGame("Garbuix mini");
		await waitFor(() => expect(router.state.location.pathname).toBe("/mini"));
		await switchGame("Garbuix!");
		await waitFor(() => expect(router.state.location.pathname).toBe("/"));
		expect(router.history.location.state.__TSR_index).toBe(0);
		await act(async () => router.history.back());
		expect(router.state.location.pathname).toBe("/");
	}
});

it("rewinds Mini history to the puzzle, so browser Back then reaches Garbuix", async () => {
	const router = await setup();
	await switchGame("Garbuix mini");
	await waitFor(() => expect(router.state.location.pathname).toBe("/mini"));
	await act(async () => router.navigate({ to: "/mini/dies-anteriors" }));
	fireEvent.click(screen.getByRole("button", { name: "Tornar" }));
	await waitFor(() => expect(router.state.location.pathname).toBe("/mini"));
	await act(async () => router.history.back());
	await waitFor(() => expect(router.state.location.pathname).toBe("/"));
});

it("returns straight to Garbuix from Mini history", async () => {
	const router = await setup();
	await act(async () => router.navigate({ to: "/mini" }));
	await act(async () => router.navigate({ to: "/mini/dies-anteriors" }));
	await switchGame("Garbuix!");
	await waitFor(() => expect(router.state.location.pathname).toBe("/"));
	expect(router.history.location.state.__TSR_index).toBe(0);
});

it.each(["/mini", "/mini/dies-anteriors"])(
	"replaces a direct %s entry when returning to Garbuix",
	async (path) => {
		const router = await setup(path);
		await switchGame("Garbuix!");
		await waitFor(() => expect(router.state.location.pathname).toBe("/"));
		expect(router.history.length).toBe(1);
	},
);

it("keeps browser Back and Forward working through Mini's history", async () => {
	const router = await setup();
	await act(async () => router.navigate({ to: "/mini" }));
	await act(async () => router.navigate({ to: "/mini/dies-anteriors" }));
	await act(async () => router.history.back());
	await waitFor(() => expect(router.state.location.pathname).toBe("/mini"));
	await act(async () => router.history.back());
	await waitFor(() => expect(router.state.location.pathname).toBe("/"));
	await act(async () => router.history.forward());
	await waitFor(() => expect(router.state.location.pathname).toBe("/mini"));
	await switchGame("Garbuix!");
	await waitFor(() => expect(router.state.location.pathname).toBe("/"));
	expect(router.history.location.state.__TSR_index).toBe(0);
});

it("preserves game ancestors when the router and header remount", async () => {
	const router = await setup();
	await act(async () => router.navigate({ to: "/mini" }));
	await act(async () => router.navigate({ to: "/mini/dies-anteriors" }));
	cleanup();
	const reloaded = createRouter({
		routeTree: router.routeTree,
		history: router.history,
	});
	render(<RouterProvider router={reloaded} />);
	await screen.findByRole("button", { name: "Tornar" });
	fireEvent.click(screen.getByRole("button", { name: "Tornar" }));
	await waitFor(() => expect(reloaded.state.location.pathname).toBe("/mini"));
	await switchGame("Garbuix!");
	await waitFor(() => expect(reloaded.state.location.pathname).toBe("/"));
	expect(reloaded.history.location.state.__TSR_index).toBe(0);
});

it("still rewinds regular Garbuix's inner pages", async () => {
	const router = await setup();
	await act(async () => router.navigate({ to: "/preferencies" }));
	await act(async () => router.navigate({ to: "/privacitat" }));
	fireEvent.click(screen.getByRole("button", { name: "Tornar" }));
	await waitFor(() => expect(router.state.location.pathname).toBe("/"));
	expect(router.history.location.state.__TSR_index).toBe(0);
});

it("links to the Reddit community from the main game only", async () => {
	const router = await setup();
	const link = screen.getByRole("link", { name: "Comunitat de Reddit" });
	expect(link.getAttribute("href")).toBe("https://www.reddit.com/r/garbuix");
	expect(link.getAttribute("target")).toBe("_blank");
	expect(link.getAttribute("title")).toBe("Comunitat de Reddit");
	await act(async () => router.navigate({ to: "/mini" }));
	expect(
		screen.queryByRole("link", { name: "Comunitat de Reddit" }),
	).toBeNull();
});
