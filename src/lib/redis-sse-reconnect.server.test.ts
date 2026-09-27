import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import { Redis } from "ioredis";
import { expect, it, vi } from "vitest";
import { getRedisSub } from "@/lib/redis.server";
import { createRedisSseStream } from "@/lib/redis-sse.server";

vi.mock("@/lib/redis.server", () => ({ getRedisSub: vi.fn() }));

function reply(values: (string | number)[]) {
	return `*${values.length}\r\n${values
		.map((value) =>
			typeof value === "number"
				? `:${value}\r\n`
				: `$${Buffer.byteLength(value)}\r\n${value}\r\n`,
		)
		.join("")}`;
}

it("removes abandoned channels after a real ioredis reconnect while preserving active viewers", async () => {
	// A local RESP peer keeps the actual ioredis command queue, subscription
	// bookkeeping and reconnect logic in the test. No Redis commands are mocked.
	const connections: { socket: Socket; channels: Set<string> }[] = [];
	const server = createServer((socket) => {
		const channels = new Set<string>();
		connections.push({ socket, channels });
		let pending = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk) => {
			pending += chunk;
			// The fixture uses only ASCII command arguments without embedded CRLF.
			// Retain partial frames and process all complete commands in each chunk.
			while (pending) {
				const lines = pending.split("\r\n");
				const end = 1 + Number(lines[0].slice(1)) * 2;
				if (lines.length <= end) return;
				const [name, ...args] = lines
					.slice(1, end)
					.filter((_, i) => i % 2 === 1);
				pending = lines.slice(end).join("\r\n");
				const command = name.toLowerCase();
				if (command === "subscribe" || command === "unsubscribe") {
					for (const channel of args) {
						if (command === "subscribe") channels.add(channel);
						else channels.delete(channel);
						socket.write(reply([command, channel, channels.size]));
					}
				} else {
					// Acknowledge ioredis's CLIENT handshake commands.
					socket.write("+OK\r\n");
				}
			}
		});
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing TCP address");
	const sub = new Redis({
		host: "127.0.0.1",
		port: address.port,
		lazyConnect: true,
		enableReadyCheck: false,
		enableOfflineQueue: false,
		retryStrategy: () => 100,
	});
	sub.on("error", () => {});
	vi.mocked(getRedisSub).mockReturnValue(sub);
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
	const open = (privateChannel: string) => {
		const reader = createRedisSseStream({
			channels: ["shared", privateChannel],
			event: "message",
			snapshot: async () => ({}),
			fallbackSnapshot: {},
			logPrefix: "[test:sse]",
		}).getReader();
		readers.push(reader);
		return reader;
	};
	try {
		await sub.connect();
		const departed = open("private:departed");
		const active = open("private:active");
		await departed.read();
		await active.read();
		await vi.waitFor(() => expect(connections[0].channels.size).toBe(3));
		connections[0].socket.write(
			reply(["message", "private:active", "before outage"]),
		);
		await active.read();

		const reconnecting = once(sub, "reconnecting");
		connections[0].socket.destroy();
		await reconnecting;
		await departed.cancel();
		await vi.waitFor(() => {
			expect(connections[1]?.channels).toEqual(
				new Set(["shared", "private:active"]),
			);
		});
		expect(sub.listenerCount("message")).toBe(1);
		expect(sub.listenerCount("ready")).toBe(1);
		connections[1].socket.write(
			reply(["message", "private:active", "after outage"]),
		);
		expect(new TextDecoder().decode((await active.read()).value)).toContain(
			"after outage",
		);
		await active.cancel();
		await vi.waitFor(() => expect(connections[1].channels.size).toBe(0));
	} finally {
		await Promise.all(readers.map((reader) => reader.cancel()));
		sub.disconnect();
		for (const { socket } of connections) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		warn.mockRestore();
	}
});
