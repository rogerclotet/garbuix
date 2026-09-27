import { once } from "node:events";
import { createServer } from "node:http";
import { createConnection, type Socket } from "node:net";
import { H3, toNodeHandler } from "nitro/h3";
import { afterEach, expect, it, vi } from "vitest";
import { proxyPostHogRequest } from "@/lib/posthog-proxy.server";

vi.mock("@/lib/observability-config", () => ({
	getServerObservabilityConfig: () => ({
		posthogKey: "test-key",
		posthogHost: "https://analytics.example.com",
	}),
}));
// Keep the action's rejection behavior without sending test telemetry.
vi.mock("@/lib/observability-server", () => ({
	observeServerAction: (_name: string, action: () => Promise<Response>) =>
		action(),
}));

afterEach(() => {
	vi.restoreAllMocks();
});

it("handles a disconnected upload without reporting an HTTPError or forwarding a partial body", async () => {
	const upstream = vi.spyOn(globalThis, "fetch");
	const logged = vi.spyOn(console, "error").mockImplementation(() => {});
	let start = () => {};
	const started = new Promise<void>((resolve) => {
		start = resolve;
	});
	let finish: (response: Response) => void = () => {};
	let fail: (error: unknown) => void = () => {};
	const finished = new Promise<Response>((resolve, reject) => {
		finish = resolve;
		fail = reject;
	});
	const app = new H3().post("/ph/e/", (event) => {
		const result = proxyPostHogRequest(event.req);
		start();
		result.then(finish, fail);
		return result;
	});
	const server = createServer(toNodeHandler(app));
	let client: Socket | undefined;
	try {
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Missing TCP address");
		client = createConnection({ host: "127.0.0.1", port: address.port });
		await once(client, "connect");
		client.write(
			"POST /ph/e/ HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\npartial",
		);
		await started;
		const handled = expect(finished).resolves.toHaveProperty("status", 499);
		client.destroy();
		await handled;
		expect(upstream).not.toHaveBeenCalled();
		expect(logged).not.toHaveBeenCalled();
	} finally {
		client?.destroy();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

it("still rejects body-read programming errors on connected requests", async () => {
	const request = new Request("https://garbuix.app/ph/e/", {
		method: "POST",
		body: "complete body",
	});
	await request.text();
	await expect(proxyPostHogRequest(request)).rejects.toBeInstanceOf(TypeError);
});

it("still rejects upstream failures, even if they have the same aborted message", async () => {
	const error = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
	vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
	await expect(
		proxyPostHogRequest(
			new Request("https://garbuix.app/ph/e/", {
				method: "POST",
				body: "complete body",
			}),
		),
	).rejects.toBe(error);
});

it("forwards a complete upload and preserves the upstream response", async () => {
	const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response("accepted", {
			status: 202,
			headers: { "Content-Type": "text/plain" },
		}),
	);
	const response = await proxyPostHogRequest(
		new Request("https://garbuix.app/ph/e/?ip=1", {
			method: "POST",
			body: "complete body",
		}),
	);
	expect(upstream).toHaveBeenCalledWith(
		new URL("https://analytics.example.com/e/?ip=1"),
		expect.objectContaining({
			method: "POST",
			body: new TextEncoder().encode("complete body").buffer,
		}),
	);
	expect(response.status).toBe(202);
	expect(await response.text()).toBe("accepted");
});
