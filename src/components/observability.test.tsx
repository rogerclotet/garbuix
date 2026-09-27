// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Metric } from "web-vitals";
import { ObservabilityProvider } from "@/components/observability";
import type { ObservabilityConfig } from "@/lib/observability-shared";
import { useObservability } from "@/lib/use-observability";

const webVitals = vi.hoisted(() => ({
	onCLS: vi.fn(),
	onFCP: vi.fn(),
	onINP: vi.fn(),
	onLCP: vi.fn(),
	onTTFB: vi.fn(),
}));
vi.mock("web-vitals", () => webVitals);

const identify = vi.fn();
const initializePostHog = vi.fn();
const reset = vi.fn();
const capture = vi.fn();
const captureException = vi.fn();

const posthogConfig = {
	posthogKey: "phc_test",
	posthogProxyPath: "/ph",
	posthogUIHost: "https://eu.posthog.com",
};
let observability: ObservabilityConfig = posthogConfig;
let location = { pathname: "/", searchStr: "" };

const sessionUser = {
	id: "user-1",
	name: "User",
	email: "user@example.com",
	image: null,
	displayName: null,
	googleImage: null,
	useGoogleAvatar: true,
};

vi.mock("@tanstack/react-router", () => ({
	getRouteApi: () => ({
		useLoaderData: () => ({
			observability,
			sessionUser,
		}),
	}),
	useRouterState: (options?: {
		select?: (state: { location: unknown }) => unknown;
	}) => {
		const state = {
			location,
		};
		return options?.select ? options.select(state) : state;
	},
}));

vi.mock("@/lib/use-active-session-user", () => ({
	useActiveSessionUser: () => ({
		activeUser: sessionUser,
		activeUserId: sessionUser.id,
		session: { data: { user: sessionUser }, isPending: false },
	}),
}));

const posthog = {
	capture,
	captureException,
	identify,
	reset,
	__loaded: true,
};

vi.mock("@posthog/react", () => ({
	usePostHog: () => posthog,
	PostHogProvider: ({
		children,
		options,
	}: {
		children: ReactNode;
		options?: { loaded?: (client: unknown) => void };
	}) => {
		useEffect(() => {
			initializePostHog(options);
			options?.loaded?.({
				identify,
			});
		}, [options]);
		return children;
	},
}));

beforeEach(() => {
	for (const observer of Object.values(webVitals)) observer.mockClear();
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation(() => ({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	});
});

describe("ObservabilityProvider", () => {
	afterEach(() => {
		cleanup();
	});
	beforeEach(() => {
		observability = posthogConfig;
		location = { pathname: "/", searchStr: "" };
		identify.mockClear();
		initializePostHog.mockClear();
		reset.mockClear();
		capture.mockClear();
		captureException.mockClear();
	});

	it("identifies the session user and disables feature flag evaluation", async () => {
		render(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);

		await waitFor(() => {
			expect(identify).toHaveBeenCalled();
		});

		const expectedProperties = {
			avatar: undefined,
			email: "user@example.com",
			name: "User",
		};
		expect(identify).toHaveBeenCalledWith("user-1", expectedProperties);
		expect(initializePostHog).toHaveBeenCalledWith(
			expect.objectContaining({ advanced_disable_feature_flags: true }),
		);
	});

	it.each([
		["/", "classic"],
		["/mini/", "mini"],
		["/mini/dies-anteriors", "mini"],
	])("tags pageviews for %s with %s", (pathname, gameMode) => {
		location = { pathname, searchStr: "" };
		render(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		expect(capture).toHaveBeenCalledWith(
			"$pageview",
			expect.objectContaining({
				game_mode: gameMode,
				pathname,
			}),
		);
	});

	it("tracks initial and SPA pageviews", () => {
		const { rerender } = render(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		expect(
			capture.mock.calls.filter(([event]) => event === "$pageview"),
		).toHaveLength(1);
		location = { pathname: "/preferencies", searchStr: "?theme=dark" };
		rerender(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		expect(
			capture.mock.calls.filter(([event]) => event === "$pageview"),
		).toHaveLength(2);
		expect(capture).toHaveBeenCalledWith(
			"$pageview",
			expect.objectContaining({
				pathname: "/preferencies",
				search: "?theme=dark",
			}),
		);
	});

	it("captures custom events from child mount effects", () => {
		render(
			<ObservabilityProvider>
				<CaptureOnMount />
			</ObservabilityProvider>,
		);
		expect(capture).toHaveBeenCalledWith("puzzle_guess_result", {
			matched: true,
			guess_length: 2,
		});
	});

	it("captures exceptions", () => {
		render(
			<ObservabilityProvider>
				<CaptureErrorOnMount />
			</ObservabilityProvider>,
		);
		expect(captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ scope: "profile_save" }),
		);
	});

	it("reports Web Vitals until unmounted", async () => {
		const { unmount } = render(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		await waitFor(() => expect(webVitals.onLCP).toHaveBeenCalledTimes(1));
		for (const observer of Object.values(webVitals))
			expect(observer).toHaveBeenCalledTimes(1);
		const report: (metric: Metric) => void = webVitals.onLCP.mock.calls[0][0];
		const metric: Metric = {
			name: "LCP",
			value: 1200,
			delta: 1200,
			rating: "good",
			id: "metric-id",
			navigationType: "navigate",
			navigationId: 1,
			entries: [],
		};
		report(metric);
		expect(capture).toHaveBeenCalledWith("web_vital", {
			name: "LCP",
			value: 1200,
			delta: 1200,
			rating: "good",
			id: "metric-id",
			navigation_type: "navigate",
		});
		unmount();
		capture.mockClear();
		report(metric);
		expect(capture).not.toHaveBeenCalled();
	});

	it("skips analytics runtime when PostHog is disabled", () => {
		observability = {};
		render(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		expect(initializePostHog).not.toHaveBeenCalled();
		expect(capture).not.toHaveBeenCalled();
	});
});

function CaptureOnMount() {
	const { captureEvent } = useObservability();
	useEffect(() => {
		captureEvent("puzzle_guess_result", { matched: true, guess_length: 2 });
	}, [captureEvent]);
	return <div>game</div>;
}

function CaptureErrorOnMount() {
	const { captureException } = useObservability();
	useEffect(() => {
		captureException(new Error("private@example.com"), {
			scope: "profile_save",
		});
	}, [captureException]);
	return null;
}
