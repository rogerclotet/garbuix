// @vitest-environment jsdom
import * as Sentry from "@sentry/tanstackstart-react";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	type RouteComponent,
	RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { minimizeSentryEvent } from "../../sentry-privacy";
import { createBundleRecovery } from "./bundle-recovery";

const message =
	"Failed to fetch dynamically imported module: https://paraules.clotet.dev/assets/routes-DpFXnarT.js";
const reload = vi.fn();
let events: Sentry.ErrorEvent[];
let client: ReturnType<typeof Sentry.init>;

beforeEach(() => {
	sessionStorage.clear();
	events = [];
	vi.stubGlobal(
		"window",
		Object.assign(Object.create(window), {
			location: { ...window.location, reload },
		}),
	);
	client = Sentry.init({
		dsn: "https://public@example.com/1",
		defaultIntegrations: false,
		beforeSend(event, hint) {
			const filtered = minimizeSentryEvent(event, hint);
			if (filtered) events.push(filtered);
			return null;
		},
	});
});

afterEach(async () => {
	cleanup();
	await client?.close();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function nextDocument() {
	const previous = createBundleRecovery();
	previous.handleError(new TypeError(message));
	previous.pageHide();
	return createBundleRecovery();
}

function makeRouter(component: RouteComponent) {
	const root = createRootRoute();
	const route = createRoute({
		getParentRoute: () => root,
		path: "/",
		component,
	});
	return createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
}

it("reports recovery only after the next document renders, exactly once", async () => {
	const recovery = nextDocument();
	const router = makeRouter(() => <div>Ready</div>);
	recovery.watchRouter(router);
	await router.load();
	await Sentry.flush();
	expect(events.map((event) => event.tags?.bundle_recovery)).toEqual([
		"attempted",
	]);
	render(<RouterProvider router={router} />);
	await waitFor(() => expect(events).toHaveLength(2));
	expect(events[1]?.tags).toEqual({ bundle_recovery: "recovered" });
	expect(events[1]?.level).toBe("info");
	expect(screen.getByText("Ready")).toBeDefined();

	cleanup();
	render(<RouterProvider router={router} />);
	await Sentry.flush();
	expect(events).toHaveLength(2);
});

it("does not count a suspended lazy component as recovered", async () => {
	const recovery = nextDocument();
	let finish: (value: { default: () => React.ReactNode }) => void = () => {};
	const component = lazyRouteComponent(
		() =>
			new Promise<{ default: () => React.ReactNode }>((resolve) => {
				finish = resolve;
			}),
	);
	const router = makeRouter(component);
	recovery.watchRouter(router);
	render(<RouterProvider router={router} />);
	await Sentry.flush();
	expect(events.map((event) => event.tags?.bundle_recovery)).toEqual([
		"attempted",
	]);
	finish({ default: () => <div>Lazy route ready</div> });
	await screen.findByText("Lazy route ready");
	await waitFor(() => expect(events).toHaveLength(2));
});

it("does not report success when the next document renders an error", async () => {
	const recovery = nextDocument();
	const router = makeRouter(() => {
		throw new TypeError(message);
	});
	router.update({
		defaultErrorComponent: function ErrorScreen({ error }) {
			useLayoutEffect(() => recovery.handleError(error), [error]);
			return <div>Failed</div>;
		},
	});
	recovery.watchRouter(router);
	await router.load();
	render(<RouterProvider router={router} />);
	await screen.findByText("Failed");
	await Sentry.flush();
	expect(events.map((event) => event.tags?.bundle_recovery)).toEqual([
		"attempted",
		"retry_failed",
	]);
	expect(reload).toHaveBeenCalledTimes(1);
});

it("observes TanStack's own reload once, then tracks recovery", async () => {
	const previous = createBundleRecovery();
	const component = lazyRouteComponent(
		async (): Promise<{ default: () => React.ReactNode }> => {
			throw new TypeError(message);
		},
	);
	const router = makeRouter(component);
	await router.load();
	render(<RouterProvider router={router} />);
	await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
	previous.pageHide();
	previous.pageHide();
	await Sentry.flush();
	expect(events.map((event) => event.tags?.bundle_recovery)).toEqual([
		"attempted",
	]);
	cleanup();
	const next = createBundleRecovery();
	const recovered = makeRouter(() => <div>Recovered</div>);
	next.watchRouter(recovered);
	await recovered.load();
	render(<RouterProvider router={recovered} />);
	await waitFor(() => expect(events).toHaveLength(2));
});

it("does not reload or record a recovery attempt for a background preload", async () => {
	const recovery = createBundleRecovery();
	const component = lazyRouteComponent(
		async (): Promise<{ default: () => React.ReactNode }> => {
			throw new TypeError(message);
		},
	);
	await component.preload?.();
	recovery.pageHide();
	await Sentry.flush();
	expect(reload).not.toHaveBeenCalled();
	expect(events).toHaveLength(0);
});

it.each(["offline", "storage blocked"])(
	"reports unavailable recovery as an error when %s",
	async (reason) => {
		if (reason === "offline") {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		} else {
			vi.stubGlobal("sessionStorage", {
				length: 0,
				getItem: () => null,
				removeItem: () => {},
				setItem: () => {
					throw new DOMException("Storage blocked", "SecurityError");
				},
			});
		}
		createBundleRecovery().handleError(new TypeError(message));
		await Sentry.flush();
		expect(reload).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0]?.level).toBe("error");
		expect(events[0]?.tags).toEqual({ bundle_recovery: "unavailable" });
	},
);

it.each(["expired", "corrupt", "different path", "missing guard"])(
	"does not report recovery for a %s marker",
	async (scenario) => {
		createBundleRecovery().handleError(new TypeError(message));
		if (scenario === "expired")
			vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60 * 1000);
		if (scenario === "corrupt")
			sessionStorage.setItem("route-bundle-recovery", "{");
		if (scenario === "different path") {
			vi.stubGlobal(
				"window",
				Object.assign(Object.create(window), {
					location: { ...window.location, pathname: "/mini" },
				}),
			);
		}
		if (scenario === "missing guard")
			sessionStorage.removeItem(`tanstack_router_reload:${message}`);
		const next = createBundleRecovery();
		const router = makeRouter(() => <div>Ready</div>);
		next.watchRouter(router);
		await router.load();
		render(<RouterProvider router={router} />);
		await screen.findByText("Ready");
		await Sentry.flush();
		expect(events.map((event) => event.tags?.bundle_recovery)).toEqual([
			"attempted",
		]);
	},
);
