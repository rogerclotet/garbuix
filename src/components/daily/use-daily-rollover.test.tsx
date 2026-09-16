// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDailyRollover } from "./use-daily-rollover";

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-06-11T21:59:59Z"));
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it("hides an expired puzzle, retries a failed refresh, and accepts the next day", async () => {
	const refresh = vi
		.fn()
		.mockRejectedValueOnce(new TypeError("Failed to fetch"))
		.mockResolvedValue(undefined);
	const { result, rerender, unmount } = renderHook(
		({ deadline }) => useDailyRollover(deadline, refresh),
		{
			initialProps: { deadline: "2026-06-11T22:00:00Z" },
		},
	);
	expect(result.current).toBe(false);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1_000);
	});
	expect(result.current).toBe(true);
	expect(refresh).toHaveBeenCalledTimes(1);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(2_000);
	});
	expect(refresh).toHaveBeenCalledTimes(2);
	rerender({ deadline: "2026-06-12T22:00:00Z" });
	expect(result.current).toBe(false);
	unmount();
	expect(vi.getTimerCount()).toBe(0);
});

it("checks suspended tabs on resume and coalesces simultaneous wake-up events", async () => {
	const refresh = vi.fn(() => new Promise<void>(() => {}));
	const { result } = renderHook(() =>
		useDailyRollover("2026-06-11T22:00:00Z", refresh),
	);
	vi.setSystemTime(new Date("2026-06-12T07:00:00Z"));
	act(() => {
		window.dispatchEvent(new Event("pageshow"));
		window.dispatchEvent(new Event("focus"));
		document.dispatchEvent(new Event("visibilitychange"));
	});
	expect(result.current).toBe(true);
	expect(refresh).toHaveBeenCalledTimes(1);
});

it("waits for connectivity when midnight arrives offline", async () => {
	const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	const refresh = vi.fn().mockResolvedValue(undefined);
	const { result } = renderHook(() =>
		useDailyRollover("2026-06-11T22:00:00Z", refresh),
	);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1_000);
	});
	expect(result.current).toBe(true);
	expect(refresh).not.toHaveBeenCalled();
	online.mockReturnValue(true);
	await act(async () => {
		window.dispatchEvent(new Event("online"));
	});
	expect(refresh).toHaveBeenCalledTimes(1);
});
