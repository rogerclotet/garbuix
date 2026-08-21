// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObservabilityProvider } from "@/components/observability";

const identify = vi.fn();
const setPersonPropertiesForFlags = vi.fn();
const reset = vi.fn();
const capture = vi.fn();
const captureException = vi.fn();

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
			observability: {
				posthogKey: "phc_test",
				posthogProxyPath: "/ph",
				posthogUIHost: "https://eu.posthog.com",
			},
			sessionUser,
		}),
	}),
	useRouterState: (options?: {
		select?: (state: { location: unknown }) => unknown;
	}) => {
		const state = {
			location: {
				pathname: "/",
				searchStr: "",
			},
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

vi.mock("@posthog/react", () => ({
	usePostHog: () => ({
		capture,
		captureException,
		identify,
		reset,
		setPersonPropertiesForFlags,
		__loaded: true,
	}),
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

describe("ObservabilityProvider", () => {
	beforeEach(() => {
		identify.mockClear();
		setPersonPropertiesForFlags.mockClear();
		reset.mockClear();
		capture.mockClear();
		captureException.mockClear();
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: vi.fn().mockImplementation(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		});
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
