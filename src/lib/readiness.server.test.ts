import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { getReadinessResponse } from "@/lib/readiness.server";

const env = vi.hoisted(
	(): { DATABASE_URL: string; REDIS_URL: string | undefined } => ({
		DATABASE_URL: "postgres://test:test@127.0.0.1:1/unused",
		REDIS_URL: undefined,
	}),
);
vi.mock("@/lib/server-env", () => ({ getServerEnv: () => env }));

afterEach(() => {
	env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/unused";
	env.REDIS_URL = undefined;
});

it("returns an uncached 503 without connection details when PostgreSQL refuses connections", async () => {
	const response = await getReadinessResponse();
	expect(response.status).toBe(503);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(await response.json()).toEqual({ status: "unavailable" });
});

async function withStalledServer(check: (port: number) => Promise<void>) {
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("data", () => {});
		socket.on("close", () => sockets.delete(socket));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing port");
	try {
		await check(address.port);
		await vi.waitFor(() => expect(sockets.size).toBe(0));
	} finally {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

it("bounds stalled PostgreSQL handshakes and closes probe sockets", async () => {
	await withStalledServer(async (port) => {
		env.DATABASE_URL = `postgres://test:test@127.0.0.1:${port}/unused`;
		const started = performance.now();
		const response = await getReadinessResponse();
		expect(response.status).toBe(503);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});

it.skipIf(!process.env.TEST_DATABASE_URL)(
	"accepts a healthy database with Redis disabled",
	async () => {
		env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
		const response = await getReadinessResponse();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
	},
);

it.skipIf(!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)(
	"accepts real PostgreSQL and Redis, including concurrent probes",
	async () => {
		env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
		env.REDIS_URL = process.env.TEST_REDIS_URL;
		const responses = await Promise.all([
			getReadinessResponse(),
			getReadinessResponse(),
		]);
		for (const response of responses) expect(response.status).toBe(200);
	},
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
	"rejects unavailable Redis even when PostgreSQL is healthy",
	async () => {
		env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
		env.REDIS_URL = "redis://127.0.0.1:1";
		expect((await getReadinessResponse()).status).toBe(503);
	},
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
	"bounds stalled Redis handshakes and closes probe sockets",
	async () => {
		env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
		await withStalledServer(async (port) => {
			env.REDIS_URL = `redis://127.0.0.1:${port}`;
			const started = performance.now();
			expect((await getReadinessResponse()).status).toBe(503);
			expect(performance.now() - started).toBeLessThan(3_000);
		});
	},
);
