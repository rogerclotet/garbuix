// @vitest-environment jsdom

import * as Sentry from "@sentry/tanstackstart-react";
import { afterEach, expect, it, vi } from "vitest";
import {
	GLITCHTIP_CONFIG_ID,
	serializeGlitchTipConfig,
} from "./glitchtip-config";

// jsdom runs inside Node, which otherwise selects the SDK's server export.
// Select the real browser implementation that Vite uses for the client build.
vi.mock("@sentry/tanstackstart-react", async () => {
	const { createRequire } = await import("node:module");
	const { pathToFileURL } = await import("node:url");
	const entry = createRequire(import.meta.url).resolve(
		"@sentry/tanstackstart-react",
	);
	return import(
		pathToFileURL(entry.replace("index.server.js", "index.client.js")).href
	);
});

afterEach(async () => {
	await Sentry.close(2000);
	vi.unstubAllGlobals();
	document.head.innerHTML = "";
});

it("captures an unhandled browser error before React mounts and disables unsupported sessions", async () => {
	const requests: { url: unknown; body: unknown }[] = [];
	vi.stubGlobal("fetch", async (url: unknown, options?: RequestInit) => {
		requests.push({ url, body: options?.body });
		return new Response("{}", { status: 200 });
	});
	const script = document.createElement("script");
	script.id = GLITCHTIP_CONFIG_ID;
	script.type = "application/json";
	script.textContent = serializeGlitchTipConfig({
		dsn: "https://public@glitchtip.example.com/1",
		environment: "test",
		tracesSampleRate: 0,
		enableLogs: false,
	});
	document.head.append(script);
	await import("../instrument.client");
	expect(
		Sentry.getClient()
			?.getOptions()
			.integrations.some(
				(integration) => integration.name === "BrowserSession",
			),
	).toBe(false);
	// The browser SDK installs on globalThis, which jsdom keeps separate from
	// its Window. Invoke that installed handler without Vitest treating the
	// intentionally unhandled exception as a runner failure.
	globalThis.onerror?.(
		"Browser smoke test",
		"http://localhost/app.js",
		1,
		1,
		new Error("Browser smoke test"),
	);
	expect(await Sentry.flush(2000)).toBe(true);
	expect(requests).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				url: "/api/monitoring",
				body: expect.stringContaining("Browser smoke test"),
			}),
		]),
	);
	expect(
		requests.some((request) =>
			String(request.body).includes('"type":"session"'),
		),
	).toBe(false);
});
