import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdownRegistry } from "@/lib/shutdown.server";

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("shutdown registry", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("waits for background work before closing its connections", async () => {
		const registry = createShutdownRegistry();
		const work = deferred();
		const events: string[] = [];
		registry.trackBackgroundTask(work.promise.then(() => events.push("work")));
		registry.registerResourceCloser(() => {
			events.push("close");
		});

		const released = registry.releaseResources(Date.now() + 1_000);
		await Promise.resolve();
		expect(events).toEqual([]);
		work.resolve();
		await released;
		expect(events).toEqual(["work", "close"]);
	});

	it("closes connections at the deadline when background work is stuck", async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const registry = createShutdownRegistry();
		const closer = vi.fn();
		registry.trackBackgroundTask(new Promise(() => {}));
		registry.registerResourceCloser(closer);

		const released = registry.releaseResources(Date.now() + 500);
		await vi.advanceTimersByTimeAsync(499);
		expect(closer).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await released;
		expect(closer).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith(
			"[shutdown] 1 background task(s) still running at the deadline",
		);
	});

	it("does not wait for background work that already finished", async () => {
		const registry = createShutdownRegistry();
		registry.trackBackgroundTask(Promise.resolve());
		await new Promise<void>((resolve) => setImmediate(resolve));

		const started = Date.now();
		await registry.releaseResources(Date.now() + 5_000);
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	it("keeps closing other resources when one fails", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const registry = createShutdownRegistry();
		const closer = vi.fn();
		registry.registerResourceCloser(async () => {
			throw new Error("pool already ended");
		});
		registry.registerResourceCloser(closer);

		await registry.releaseResources(Date.now());
		expect(closer).toHaveBeenCalledOnce();
		expect(error).toHaveBeenCalledWith(
			"[shutdown] Closing a resource failed:",
			expect.objectContaining({ message: "pool already ended" }),
		);
	});

	it("closes each open stream once and skips unregistered ones", () => {
		const registry = createShutdownRegistry();
		const open = vi.fn();
		const finished = vi.fn();
		registry.registerOpenStream(open);
		registry.registerOpenStream(finished)();

		registry.closeOpenStreams();
		registry.closeOpenStreams();
		expect(open).toHaveBeenCalledOnce();
		expect(finished).not.toHaveBeenCalled();
	});
});
