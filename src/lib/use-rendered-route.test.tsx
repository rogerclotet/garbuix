// @vitest-environment jsdom
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMiniRoute } from "@/lib/use-mini-route";
import { useRenderedPathname } from "@/lib/use-rendered-route";
import { useSyllableRoute } from "@/lib/use-syllable-route";

beforeEach(() => {
	vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function Shell() {
	const mini = useMiniRoute();
	const syllables = useSyllableRoute();
	const pathname = useRenderedPathname();
	return (
		<div
			data-testid="shell"
			data-game={syllables ? "syllables" : mini ? "mini" : "regular"}
			data-pathname={pathname}
		>
			<Outlet />
		</div>
	);
}

function setup() {
	let finishMiniLoader = () => {};
	const root = createRootRoute({ component: Shell });
	// Layout effects run after React has applied the whole commit to the DOM,
	// so this is what the browser paints in the page's first frame.
	const gamesAtFirstPaint: Record<string, string | undefined> = {};
	const page = (path: string, loader?: () => Promise<void>) =>
		createRoute({
			getParentRoute: () => root,
			path,
			loader,
			component: function Page() {
				useLayoutEffect(() => {
					gamesAtFirstPaint[path] = shell().game;
				}, []);
				return <p>page {path}</p>;
			},
		});
	const routeTree = root.addChildren([
		page("/"),
		page(
			"/mini/",
			() =>
				new Promise<void>((resolve) => {
					finishMiniLoader = resolve;
				}),
		),
		page("/mini/dies-anteriors"),
		page("/sillabes/"),
	]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	render(<RouterProvider router={router} />);
	return {
		router,
		gamesAtFirstPaint,
		finishMiniLoader: () => finishMiniLoader(),
	};
}

function shell() {
	const { game, pathname } = screen.getByTestId("shell").dataset;
	return { game, pathname };
}

it("keeps the previous game until the next one renders", async () => {
	const { router, gamesAtFirstPaint, finishMiniLoader } = setup();
	await screen.findByText("page /");

	let navigation: Promise<void> = Promise.resolve();
	await act(async () => {
		navigation = router.navigate({ to: "/mini" });
		await Promise.resolve();
	});
	// The URL has moved, but the regular game is still on screen.
	expect(router.state.location.pathname).toBe("/mini");
	expect(screen.getByText("page /")).toBeTruthy();
	expect(shell()).toEqual({ game: "regular", pathname: "/" });

	await act(async () => {
		finishMiniLoader();
		await navigation;
	});
	expect(screen.getByText("page /mini/")).toBeTruthy();
	expect(shell()).toEqual({ game: "mini", pathname: "/mini" });
	expect(gamesAtFirstPaint["/mini/"]).toBe("mini");
});

it("recognises each game's index and inner pages", async () => {
	const { router } = setup();
	await screen.findByText("page /");

	await act(async () => router.navigate({ to: "/mini/dies-anteriors" }));
	expect(shell()).toEqual({ game: "mini", pathname: "/mini/dies-anteriors" });

	await act(async () => router.navigate({ to: "/sillabes" }));
	expect(shell()).toEqual({ game: "syllables", pathname: "/sillabes" });
});
