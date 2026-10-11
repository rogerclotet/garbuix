import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import { captureException } from "@sentry/tanstackstart-react";
import { expect, it, vi } from "vitest";
import { getRedis, getRedisSub } from "@/lib/redis.server";

const env = vi.hoisted(() => ({ REDIS_URL: "" }));
vi.mock("@/lib/server-env", () => ({ getServerEnv: () => env }));
vi.mock("@sentry/tanstackstart-react", () => ({ captureException: vi.fn() }));

it("rejects a subscribe issued during the handshake without breaking readiness", async () => {
	// Exercise the production factory and real ioredis against a local RESP peer.
	const sockets: Socket[] = [];
	const commands: string[] = [];
	const server = createServer((socket) => {
		sockets.push(socket);
		let pending = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk) => {
			pending += chunk;
			// Fixture arguments are ASCII and contain no embedded CRLF.
			while (pending) {
				const lines = pending.split("\r\n");
				const end = 1 + Number(lines[0].slice(1)) * 2;
				if (lines.length <= end) return;
				const name = lines[2].toLowerCase();
				pending = lines.slice(end).join("\r\n");
				commands.push(name);
				if (name === "hello") {
					socket.write("%1\r\n$5\r\nproto\r\n:3\r\n");
				} else if (name === "subscribe") {
					// RESP3 confirms subscriptions with a push frame.
					socket.write(">3\r\n$9\r\nsubscribe\r\n$4\r\ntest\r\n:1\r\n");
				} else if (name === "info") {
					socket.write("$11\r\nloading:0\r\n\r\n");
				} else {
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
	env.REDIS_URL = `redis://127.0.0.1:${address.port}`;
	const sub = getRedisSub();
	if (!sub) throw new Error("Missing subscriber");
	let publisher: ReturnType<typeof getRedis> = null;
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	try {
		const ready = once(sub, "ready", { signal: AbortSignal.timeout(2_000) });
		const early = new Promise<unknown>((resolve) => {
			// ioredis writes only its own commands until the handshake finishes.
			// The subscriber has no offline queue, so this fails straight away.
			// SSE streams wait for the connection to settle for that reason.
			sub.once("connect", () => sub.subscribe("test").then(resolve, resolve));
		});
		await ready;
		expect(await early).toBeInstanceOf(Error);
		expect(commands).not.toContain("subscribe");

		await sub.subscribe("test");
		expect(sub.status).toBe("ready");
		expect(commands).toContain("subscribe");
		expect(commands).not.toContain("info");
		expect(captureException).not.toHaveBeenCalled();

		publisher = getRedis();
		if (!publisher) throw new Error("Missing publisher");
		await once(publisher, "ready", { signal: AbortSignal.timeout(2_000) });
		expect(commands).toContain("info");
	} finally {
		sub.disconnect();
		publisher?.disconnect();
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		warn.mockRestore();
	}
});
