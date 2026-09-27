// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { UsageEnabledContext } from "./usage-context";
import { useObservability } from "./use-observability";

const capture = vi.fn();
const error = vi.fn();
vi.mock("./usage-client", () => ({
	captureUsage: (event: unknown) => capture(event),
}));
vi.mock("./error-tracking-client", () => ({
	captureBrowserException: (...args: unknown[]) => error(...args),
}));
afterEach(() => {
	capture.mockClear();
	error.mockClear();
});

it("defaults to no collection outside an enabled provider", () => {
	const { result } = renderHook(useObservability);
	result.current.captureEvent({ event: "help_opened" });
	expect(capture).not.toHaveBeenCalled();
});
it("keeps anonymous usage and error reporting separate", () => {
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(UsageEnabledContext, { value: true }, children);
	const { result } = renderHook(useObservability, { wrapper });
	result.current.captureEvent({ event: "help_opened" });
	result.current.captureException(new Error("test"), { scope: "test" });
	expect(capture).toHaveBeenCalledExactlyOnceWith({ event: "help_opened" });
	expect(error).toHaveBeenCalledTimes(1);
	expect(result.current).not.toHaveProperty("identifyUser");
});
