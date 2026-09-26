// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObservabilityProvider } from "@/components/observability";
import type { ObservabilityConfig } from "@/lib/observability-shared";
import { useObservability } from "@/lib/use-observability";

const identify = vi.fn();
const setPersonPropertiesForFlags = vi.fn();
const reset = vi.fn();
const capture = vi.fn();
const captureException = vi.fn();

const posthogConfig = {
	posthogKey: "phc_test",
	posthogProxyPath: "/ph",
	posthogUIHost: "https://eu.posthog.com",
};
let observability: ObservabilityConfig = posthogConfig;
const fetchMock = vi.fn<typeof fetch>();
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
	setPersonPropertiesForFlags,
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
			options?.loaded?.({
				identify,
				setPersonPropertiesForFlags,
			});
		}, [options]);
		return children;
	},
}));

beforeEach(() => {
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
		vi.unstubAllGlobals();
	});
	beforeEach(() => {
		observability = posthogConfig;
		location = { pathname: "/", searchStr: "" };
		fetchMock
			.mockReset()
			.mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		identify.mockClear();
		setPersonPropertiesForFlags.mockClear();
		reset.mockClear();
		capture.mockClear();
		captureException.mockClear();
	});

	it("identifies the session user from PostHog's loaded callback so email-targeted flags are available before the first /flags request", async () => {
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
		expect(setPersonPropertiesForFlags).toHaveBeenCalledWith(
			expectedProperties,
		);
	});
});

function CaptureOnMount() {
	const { captureEvent } = useObservability();
	useEffect(() => {
		captureEvent("puzzle_guess_result", { matched: true, guess_length: 2 });
	}, [captureEvent]);
	return <div>game</div>;
}

function sentMessages() {
	return fetchMock.mock.calls.map(([, options]) =>
		JSON.parse(String(options?.body)),
	);
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

describe("Umami through ObservabilityProvider", () => {
	beforeEach(() => {
		observability = { umamiEnabled: true };
		location = { pathname: "/", searchStr: "" };
		capture.mockClear();
		fetchMock
			.mockReset()
			.mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
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
		expect(sentMessages()).toContainEqual(
			expect.objectContaining({
				payload: expect.objectContaining({
					data: expect.objectContaining({ game_mode: gameMode }),
				}),
			}),
		);
	});

	it("keeps identification and raw errors in PostHog only", () => {
		observability = { ...posthogConfig, umamiEnabled: true };
		captureException.mockClear();
		render(
			<ObservabilityProvider>
				<CaptureErrorOnMount />
			</ObservabilityProvider>,
		);
		expect(identify).toHaveBeenCalledWith(
			sessionUser.id,
			expect.objectContaining({ email: sessionUser.email }),
		);
		expect(captureException).toHaveBeenCalled();
		expect(sentMessages().every((message) => message.type === "event")).toBe(
			true,
		);
		expect(JSON.stringify(sentMessages())).not.toMatch(
			/private@example|user@example|user-1|\$exception/,
		);
	});

	it("tracks initial and SPA pageviews with PostHog disabled", () => {
		const { rerender } = render(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		expect(
			sentMessages().filter((m) => m.type === "event" && !m.payload.name),
		).toHaveLength(1);
		location = { pathname: "/preferencies", searchStr: "?theme=dark" };
		window.history.replaceState({}, "", "/preferencies?theme=dark");
		rerender(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		const pageviews = sentMessages().filter(
			(m) => m.type === "event" && !m.payload.name,
		);
		expect(pageviews).toHaveLength(2);
		expect(pageviews[1].payload.url).toBe("/preferencies");
		window.history.replaceState({}, "", "/");
	});

	it("mirrors custom events to both providers, including child mount effects", () => {
		observability = { ...posthogConfig, umamiEnabled: true };
		render(
			<ObservabilityProvider>
				<CaptureOnMount />
			</ObservabilityProvider>,
		);
		expect(capture).toHaveBeenCalledWith("puzzle_guess_result", {
			matched: true,
			guess_length: 2,
		});
		expect(
			sentMessages().filter((m) => m.payload.name === "puzzle_guess_result"),
		).toEqual([
			expect.objectContaining({
				payload: expect.objectContaining({
					name: "puzzle_guess_result",
					data: { matched: true, guess_length: 2 },
				}),
			}),
		]);
	});

	it("sends no Umami requests when disabled", () => {
		observability = {};
		render(
			<ObservabilityProvider>
				<CaptureOnMount />
			</ObservabilityProvider>,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("removes page exit listeners when unmounted", () => {
		const { unmount } = render(
			<ObservabilityProvider>
				<div>app</div>
			</ObservabilityProvider>,
		);
		window.dispatchEvent(new Event("pagehide"));
		expect(
			sentMessages().some((message) => message.payload.name === "$exception"),
		).toBe(false);
		expect(sentMessages()).toContainEqual(
			expect.objectContaining({
				payload: expect.objectContaining({ name: "$pageleave" }),
			}),
		);
		unmount();
		fetchMock.mockClear();
		window.dispatchEvent(new Event("pagehide"));
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
