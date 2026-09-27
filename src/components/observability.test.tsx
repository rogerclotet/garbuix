// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ObservabilityProvider } from "./observability";

let enabled = true;
let pathname = "/";
const captureUsage = vi.fn();
const clearLegacyPostHogStorage = vi.fn();
vi.mock("@/lib/usage-client", () => ({
	captureUsage: (action: unknown, path: string) => captureUsage(action, path),
	clearLegacyPostHogStorage: () => clearLegacyPostHogStorage(),
}));
vi.mock("@tanstack/react-router", () => ({
	getRouteApi: () => ({
		useLoaderData: () => ({
			observability: { analyticsEnabled: enabled },
			sessionUser: { id: "private", email: "private@example.com" },
		}),
	}),
	useRouterState: () => pathname,
}));
beforeEach(() => {
	enabled = true;
	pathname = "/";
	captureUsage.mockClear();
	clearLegacyPostHogStorage.mockClear();
});
afterEach(cleanup);

it("counts navigation once in StrictMode without observing the signed-in user", () => {
	const view = () => (
		<StrictMode>
			<ObservabilityProvider>
				<div>game</div>
			</ObservabilityProvider>
		</StrictMode>
	);
	const { rerender } = render(view());
	expect(captureUsage).toHaveBeenCalledExactlyOnceWith(
		{ event: "page_view" },
		"/",
	);
	rerender(view());
	expect(captureUsage).toHaveBeenCalledTimes(1);
	pathname = "/mini";
	rerender(view());
	expect(captureUsage).toHaveBeenCalledTimes(2);
	expect(captureUsage).toHaveBeenLastCalledWith(
		{ event: "page_view" },
		"/mini",
	);
	expect(JSON.stringify(captureUsage.mock.calls)).not.toContain("private");
});

it("still clears legacy identities while the new collection is disabled", () => {
	enabled = false;
	render(
		<ObservabilityProvider>
			<div>game</div>
		</ObservabilityProvider>,
	);
	expect(captureUsage).not.toHaveBeenCalled();
	expect(clearLegacyPostHogStorage).toHaveBeenCalled();
});
