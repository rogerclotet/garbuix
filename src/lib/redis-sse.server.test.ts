import { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedisSub } from "@/lib/redis.server";
import { createRedisSseStream } from "@/lib/redis-sse.server";

vi.mock("@/lib/redis.server", () => ({ getRedisSub: vi.fn() }));

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const decoder = new TextDecoder();

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("Redis SSE lifecycle", () => {
	let sub: Redis;
	const streams: ReadableStream<Uint8Array>[] = [];
	const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		// Keep ioredis's real EventEmitter, but never connect to a server.
		sub = new Redis({ lazyConnect: true });
		vi.mocked(getRedisSub).mockReturnValue(sub);
		vi.spyOn(sub, "subscribe").mockResolvedValue(1);
		vi.spyOn(sub, "unsubscribe").mockResolvedValue(0);
	});

	afterEach(async () => {
		await Promise.all(readers.splice(0).map((reader) => reader.cancel()));
		await Promise.all(
			streams
				.splice(0)
				.filter((stream) => !stream.locked)
				.map((stream) => stream.cancel()),
		);
		sub.disconnect();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function open(
		options: Partial<Parameters<typeof createRedisSseStream>[0]> = {},
	) {
		const stream = createRedisSseStream({
			channels: ["shared"],
			event: "message",
			snapshot: async () => ({ entries: [] }),
			fallbackSnapshot: { entries: [] },
			logPrefix: "[test:sse]",
			...options,
		});
		streams.push(stream);
		return stream;
	}

	function read(stream: ReadableStream<Uint8Array>) {
		const reader = stream.getReader();
		readers.push(reader);
		return reader;
	}

	it("shares one Redis listener across viewers and unsubscribes only after the last leaves", async () => {
		const viewers = Array.from({ length: 11 }, () => open());
		await settle();
		expect(sub.listenerCount("message")).toBe(1);
		expect(sub.listenerCount("ready")).toBe(1);
		expect(sub.subscribe).toHaveBeenCalledExactlyOnceWith("shared");
		expect(vi.getTimerCount()).toBe(11);
		await Promise.all(viewers.slice(0, 10).map((stream) => stream.cancel()));
		expect(sub.unsubscribe).not.toHaveBeenCalled();
		await viewers[10].cancel();
		expect(sub.unsubscribe).toHaveBeenCalledExactlyOnceWith("shared");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("routes shared and private messages only to their viewers and preserves SSE event names", async () => {
		const first = read(open({ channels: ["shared", "private:a"] }));
		const second = read(
			open({ channels: ["shared", "private:b"], event: "update" }),
		);
		await settle();
		expect(decoder.decode((await first.read()).value)).toBe(
			'event: snapshot\ndata: {"entries":[]}\n\n',
		);
		await second.read();
		sub.emit("message", "private:a", "private");
		sub.emit("message", "shared", "public");
		expect(decoder.decode((await first.read()).value)).toBe(
			"event: message\ndata: private\n\n",
		);
		expect(decoder.decode((await first.read()).value)).toBe(
			"event: message\ndata: public\n\n",
		);
		expect(decoder.decode((await second.read()).value)).toBe(
			"event: update\ndata: public\n\n",
		);
		await first.cancel();
		expect(sub.unsubscribe).toHaveBeenCalledExactlyOnceWith("private:a");
		await second.cancel();
		expect(sub.unsubscribe).toHaveBeenCalledWith("private:b");
		expect(sub.unsubscribe).toHaveBeenCalledWith("shared");
	});

	it("does not create subscriptions or heartbeats after cancellation during the snapshot", async () => {
		const gate = deferred();
		const stream = open({ snapshot: () => gate.promise });
		await stream.cancel();
		gate.resolve();
		await settle();
		expect(sub.subscribe).not.toHaveBeenCalled();
		expect(sub.listenerCount("message")).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("cleans up immediately during a pending subscription and does not create a late heartbeat", async () => {
		const gate = deferred();
		vi.mocked(sub.subscribe).mockImplementation(async () => {
			await gate.promise;
			return 1;
		});
		const stream = open();
		await settle();
		await stream.cancel();
		expect(sub.unsubscribe).toHaveBeenCalledExactlyOnceWith("shared");
		gate.resolve();
		await settle();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps a replacement viewer subscribed when an older subscription finishes late", async () => {
		const gate = deferred();
		vi.mocked(sub.subscribe).mockImplementationOnce(async () => {
			await gate.promise;
			return 1;
		});
		const old = open();
		await settle();
		await old.cancel();
		const replacement = read(open());
		await settle();
		gate.resolve();
		await settle();
		expect(sub.subscribe).toHaveBeenCalledTimes(2);
		expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(sub.subscribe).mock.invocationCallOrder[1],
		).toBeGreaterThan(vi.mocked(sub.unsubscribe).mock.invocationCallOrder[0]);
		expect(vi.getTimerCount()).toBe(1);
		await replacement.read();
		sub.emit("message", "shared", "still connected");
		expect(decoder.decode((await replacement.read()).value)).toContain(
			"still connected",
		);
	});

	it("closes a failed subscription so EventSource can reconnect without leaked resources", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(sub.subscribe).mockRejectedValueOnce(
			new Error("Redis unavailable"),
		);
		const reader = read(open());
		await settle();
		await reader.read();
		expect((await reader.read()).done).toBe(true);
		expect(sub.unsubscribe).toHaveBeenCalledExactlyOnceWith("shared");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("retries failed cleanup on each reconnect and stops once Redis acknowledges it", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(sub.unsubscribe)
			.mockRejectedValueOnce(new Error("offline"))
			.mockRejectedValueOnce(new Error("disconnected again"));
		const stream = open();
		await settle();
		await stream.cancel();
		await settle();
		sub.emit("ready");
		await settle();
		expect(sub.unsubscribe).toHaveBeenCalledTimes(2);
		sub.emit("ready");
		await settle();
		expect(sub.unsubscribe).toHaveBeenCalledTimes(3);
		sub.emit("ready");
		await settle();
		expect(sub.unsubscribe).toHaveBeenCalledTimes(3);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not retry abandoned cleanup after a new viewer reclaims the channel", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(sub.unsubscribe).mockRejectedValueOnce(new Error("offline"));
		const old = open();
		await settle();
		await old.cancel();
		await settle();
		const replacement = read(open());
		await settle();
		sub.emit("ready");
		await settle();
		expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
		await replacement.read();
		sub.emit("message", "shared", "still connected");
		expect(decoder.decode((await replacement.read()).value)).toContain(
			"still connected",
		);
	});

	it("does not remove a new viewer when an earlier unsubscribe completes late", async () => {
		const gate = deferred();
		vi.mocked(sub.unsubscribe).mockImplementationOnce(async () => {
			await gate.promise;
			return 0;
		});
		const old = open();
		await settle();
		await old.cancel();
		const replacement = read(open());
		await settle();
		gate.resolve();
		await settle();
		sub.emit("ready");
		await replacement.read();
		sub.emit("message", "shared", "still connected");
		expect(decoder.decode((await replacement.read()).value)).toContain(
			"still connected",
		);
		expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
		await replacement.cancel();
		expect(sub.unsubscribe).toHaveBeenCalledTimes(2);
	});

	it("sends the fallback snapshot and keeps live updates when the snapshot fails", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const reader = read(
			open({
				snapshot: async () => {
					throw new Error("snapshot failed");
				},
			}),
		);
		await settle();
		expect(decoder.decode((await reader.read()).value)).toBe(
			'event: snapshot\ndata: {"entries":[]}\n\n',
		);
		sub.emit("message", "shared", "new data");
		expect(decoder.decode((await reader.read()).value)).toContain("new data");
	});
});
