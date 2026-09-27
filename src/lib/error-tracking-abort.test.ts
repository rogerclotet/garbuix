import { once } from "node:events";
import { createServer } from "node:http";
import { createConnection, type Socket } from "node:net";
import { HTTPError } from "nitro/h3";
import { expect, it } from "vitest";
import { isIncomingRequestAbort } from "./error-tracking.server";

it("drops the real incoming disconnect and H3's wrapper around it", async () => {
	let start = () => {};
	const started = new Promise<void>((resolve) => {
		start = resolve;
	});
	let abort: (error: Error) => void = () => {};
	const aborted = new Promise<Error>((resolve) => {
		abort = resolve;
	});
	const server = createServer((request) => {
		request.on("error", abort);
		request.resume();
		start();
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
		client.write(
			"POST /ph/e/ HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\npartial",
		);
		await started;
		client.destroy();
		const error = await aborted;
		expect(error).toMatchObject({ message: "aborted", code: "ECONNRESET" });
		for (const originalException of [error, new HTTPError(error)]) {
			expect(isIncomingRequestAbort(originalException)).toBe(true);
		}
		// A domain failure must still be reported even if it has this cause.
		expect(
			isIncomingRequestAbort(
				new Error("Saving progress failed", { cause: error }),
			),
		).toBe(false);
	} finally {
		client?.destroy();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

it("keeps malformed HTTPError cause chains without looping", () => {
	const error = new HTTPError({ message: "aborted", status: 500 });
	Object.defineProperty(error, "cause", { value: error });
	expect(isIncomingRequestAbort(error)).toBe(false);
});

it.each([
	new Error("aborted"),
	new DOMException("The operation was aborted", "AbortError"),
	new DOMException("The operation timed out", "TimeoutError"),
	Object.assign(new Error("aborted"), { code: "ECONNRESET" }),
	new HTTPError({ message: "aborted", status: 500 }),
	undefined,
])("preserves unconfirmed aborts, timeouts and other errors: %s", (error) => {
	expect(isIncomingRequestAbort(error)).toBe(false);
});

it("preserves upstream connection resets", () => {
	const error = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
	error.stack =
		"Error: aborted\n    at socketCloseListener (node:_http_client:500:12)";
	expect(isIncomingRequestAbort(error)).toBe(false);
});
