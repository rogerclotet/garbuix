import { once } from "node:events";
import { createServer } from "node:http";
import { createConnection, type Socket } from "node:net";
import { Redis } from "ioredis";
import { H3, toNodeHandler } from "nitro/h3";
import { expect, it, vi } from "vitest";
import { getRedisSub } from "@/lib/redis.server";
import { createRedisSseStream } from "@/lib/redis-sse.server";

vi.mock("@/lib/redis.server", () => ({ getRedisSub: vi.fn() }));

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

it.each(["snapshot", "subscription"])(
	"cleans up an HTTP disconnect while the %s is pending",
	async (pending) => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		const sub = new Redis({ lazyConnect: true });
		vi.mocked(getRedisSub).mockReturnValue(sub);
		const gate = deferred();
		const subscribe = vi
			.spyOn(sub, "subscribe")
			.mockImplementation(async () => {
				if (pending === "subscription") await gate.promise;
				return 1;
			});
		const unsubscribe = vi.spyOn(sub, "unsubscribe").mockResolvedValue(0);
		let stream: ReadableStream<Uint8Array> | undefined;
		const app = new H3().get("/stream", () => {
			stream = createRedisSseStream({
				channels: ["shared"],
				event: "message",
				snapshot: async () => {
					if (pending === "snapshot") await gate.promise;
					return { entries: [] };
				},
				fallbackSnapshot: { entries: [] },
				logPrefix: "[test:sse]",
			});
			return new Response(stream, {
				headers: { "Content-Type": "text/event-stream" },
			});
		});
		// Use Nitro's bundled H3/srvx adapter, including its real response cleanup.
		const server = createServer(toNodeHandler(app));
		const responseClosed = deferred();
		server.on("request", (_request, response) => {
			response.once("close", responseClosed.resolve);
		});
		let client: Socket | undefined;
		try {
			server.listen(0, "127.0.0.1");
			await once(server, "listening");
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Missing TCP address");
			client = createConnection({ host: "127.0.0.1", port: address.port });
			await once(client, "connect");
			client.write("GET /stream HTTP/1.1\r\nHost: localhost\r\n\r\n");
			await vi.waitFor(() => {
				// Wait until the HTTP adapter owns the stream before disconnecting.
				expect(stream?.locked).toBe(true);
				if (pending === "subscription") {
					expect(subscribe).toHaveBeenCalledExactlyOnceWith("shared");
				}
			});
			expect(vi.getTimerCount()).toBe(0);

			// Only close the client socket. Never call stream.cancel() in this test.
			client.destroy();
			await responseClosed.promise;
			if (pending === "subscription") {
				expect(unsubscribe).toHaveBeenCalledExactlyOnceWith("shared");
			}

			gate.resolve();
			await new Promise<void>((resolve) => setImmediate(resolve));
			if (pending === "snapshot") {
				expect(subscribe).not.toHaveBeenCalled();
				expect(unsubscribe).not.toHaveBeenCalled();
				expect(sub.listenerCount("message")).toBe(0);
			}
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			client?.destroy();
			server.closeAllConnections();
			gate.resolve();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			sub.disconnect();
			vi.useRealTimers();
			vi.restoreAllMocks();
		}
	},
);
