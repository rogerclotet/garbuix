// @vitest-environment jsdom
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.resetModules();
	vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function ErrorPage() {
	return <p>Error page</p>;
}

function buildRouter(
	loader: (context: { route: { id: string } }) => Promise<string>,
) {
	const root = createRootRoute();
	const game = createRoute({
		getParentRoute: () => root,
		path: "/",
		loader,
		component: () => <p>{game.useLoaderData()}</p>,
	});
	const history = createRoute({
		getParentRoute: () => root,
		path: "/dies-anteriors",
		component: () => <p>History</p>,
	});
	return createRouter({
		routeTree: root.addChildren([game, history]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
		defaultErrorComponent: ErrorPage,
	});
}

it("keeps a page's data when it is entered again offline", async () => {
	const { withOfflineFallback } = await import("@/lib/offline-loader");
	let online = true;
	const router = buildRouter(
		withOfflineFallback(async () => {
			if (!online) throw new TypeError("Failed to fetch");
			return "Today's board";
		}),
	);
	await router.load();
	render(<RouterProvider router={router} />);
	await screen.findByText("Today's board");

	await router.navigate({ to: "/dies-anteriors" });
	await screen.findByText("History");

	online = false;
	await router.navigate({ to: "/" });
	await screen.findByText("Today's board");
	expect(screen.queryByText("Error page")).toBeNull();
});

it("uses the data a page hydrated with", async () => {
	const { rememberRenderedLoaderData, withOfflineFallback } = await import(
		"@/lib/offline-loader"
	);
	// Stands in for the server render: this data never passed through the
	// wrapped loader.
	const rendered = buildRouter(async () => "Server board");
	rememberRenderedLoaderData(rendered);
	await rendered.load();
	render(<RouterProvider router={rendered} />);
	await screen.findByText("Server board");
	cleanup();

	const offline = buildRouter(
		withOfflineFallback(async () => {
			throw new TypeError("Load failed");
		}),
	);
	await offline.load();
	render(<RouterProvider router={offline} />);
	await screen.findByText("Server board");
});

it("still fails a page it never loaded, or a read the server rejected", async () => {
	const { withOfflineFallback } = await import("@/lib/offline-loader");
	const neverLoaded = buildRouter(
		withOfflineFallback(async () => {
			throw new TypeError("Failed to fetch");
		}),
	);
	await neverLoaded.load();
	render(<RouterProvider router={neverLoaded} />);
	await screen.findByText("Error page");
	cleanup();

	let fail = false;
	const rejected = buildRouter(
		withOfflineFallback(async () => {
			if (fail) throw new Error("Puzzle not found");
			return "Today's board";
		}),
	);
	await rejected.load();
	render(<RouterProvider router={rejected} />);
	await screen.findByText("Today's board");
	await rejected.navigate({ to: "/dies-anteriors" });
	fail = true;
	await rejected.navigate({ to: "/" });
	await screen.findByText("Error page");
});
