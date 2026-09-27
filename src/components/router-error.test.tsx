// @vitest-environment jsdom
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	lazyFn,
	RouterProvider,
} from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RouterErrorComponent } from "./router-error";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@/lib/use-observability", () => ({
	useObservability: () => ({ captureException }),
}));

const reload = vi.fn();
const error = new TypeError(
	"Failed to fetch dynamically imported module: https://garbuix.app/assets/classificacio-b2pi-xLG.js",
);

function renderError(failure = error) {
	return render(
		<StrictMode>
			<RouterErrorComponent error={failure} reset={() => {}} />
		</StrictMode>,
	);
}

beforeEach(() => {
	sessionStorage.clear();
	vi.stubGlobal(
		"window",
		Object.assign(Object.create(window), {
			location: { ...window.location, reload },
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it("reloads a missing route bundle once, including under StrictMode", () => {
	renderError();
	expect(reload).toHaveBeenCalledTimes(1);
	expect(captureException).not.toHaveBeenCalled();

	// A second document with the same failed import must show the error.
	cleanup();
	renderError();
	expect(reload).toHaveBeenCalledTimes(1);
	expect(captureException).toHaveBeenCalledWith(error, {
		scope: "router_error_boundary",
	});
});

it("does not retry an import TanStack already reloaded for", () => {
	sessionStorage.setItem(`tanstack_router_reload:${error.message}`, "1");
	renderError();
	expect(reload).not.toHaveBeenCalled();
	expect(captureException).toHaveBeenCalled();
});

it.each([
	"error loading dynamically imported module: https://garbuix.app/assets/route.js",
	"Importing a module script failed.",
	"Unable to preload CSS for /assets/route.css",
])("recovers the load error: %s", (message) => {
	renderError(new TypeError(message));
	expect(reload).toHaveBeenCalledTimes(1);
});

it("reports ordinary application errors without reloading", () => {
	renderError(new Error("Cannot read properties of undefined"));
	expect(reload).not.toHaveBeenCalled();
	expect(captureException).toHaveBeenCalled();
});

it("offers a manual reload while offline", () => {
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	renderError();
	expect(reload).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Recarrega la pàgina" }));
	expect(reload).toHaveBeenCalledTimes(1);
});

it("keeps the error usable when session storage is blocked", () => {
	vi.stubGlobal("sessionStorage", {
		getItem: () => null,
		setItem: () => {
			throw new DOMException("Storage blocked", "SecurityError");
		},
	});
	renderError();
	expect(reload).not.toHaveBeenCalled();
	expect(captureException).toHaveBeenCalledWith(error, {
		scope: "router_error_boundary",
	});
});

it("recovers a failed split loader through the actual router error boundary", async () => {
	const root = createRootRoute();
	const route = createRoute({
		getParentRoute: () => root,
		path: "/classificacio",
		loader: lazyFn(async (): Promise<{ loader: () => void }> => {
			throw error;
		}, "loader"),
	});
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/classificacio"] }),
		defaultErrorComponent: RouterErrorComponent,
	});
	await router.load();
	render(<RouterProvider router={router} />);
	await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});
