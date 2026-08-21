import { describe, expect, it } from "vitest";
import {
	getPostHogProxyHeaders,
	getPostHogProxyResponseHeaders,
	getPostHogProxyTarget,
} from "@/lib/posthog-proxy";

describe("posthog-proxy", () => {
	it("routes analytics requests to the configured PostHog host", () => {
		const targetUrl = getPostHogProxyTarget(
			"https://garbuix.cat/ph/e/?ip=1&_=123",
			"https://eu.i.posthog.com",
		);

		expect(targetUrl.toString()).toBe("https://eu.i.posthog.com/e/?ip=1&_=123");
	});

	it("routes static assets to the PostHog assets host", () => {
		const targetUrl = getPostHogProxyTarget(
			"https://garbuix.cat/ph/static/array.js",
			"https://eu.i.posthog.com",
		);

		expect(targetUrl.toString()).toBe(
			"https://eu-assets.i.posthog.com/static/array.js",
		);
	});

	it("routes remote config under /array/ to the PostHog assets host", () => {
		const targetUrl = getPostHogProxyTarget(
			"https://garbuix.cat/ph/array/phc_token/config?ip=1",
			"https://eu.i.posthog.com",
		);

		expect(targetUrl.toString()).toBe(
			"https://eu-assets.i.posthog.com/array/phc_token/config?ip=1",
		);
	});

	it("preserves a custom base path for self-hosted PostHog", () => {
		const targetUrl = getPostHogProxyTarget(
			"https://garbuix.cat/ph/e/",
			"https://analytics.example.com/ingest",
		);

		expect(targetUrl.toString()).toBe(
			"https://analytics.example.com/ingest/e/",
		);
	});

	it("rebuilds forwarded headers for the upstream request", () => {
		const headers = getPostHogProxyHeaders(
			new Headers({
				connection: "keep-alive",
				"content-length": "42",
				host: "garbuix.cat",
				origin: "https://garbuix.cat",
			}),
			new URL("https://eu.i.posthog.com/e/"),
		);

		expect(headers.get("connection")).toBeNull();
		expect(headers.get("content-length")).toBeNull();
		expect(headers.get("host")).toBe("eu.i.posthog.com");
		expect(headers.get("origin")).toBe("https://garbuix.cat");
	});

	it("strips stale encoding headers from the proxied response", () => {
		const headers = getPostHogProxyResponseHeaders(
			new Headers({
				connection: "keep-alive",
				"content-encoding": "gzip",
				"content-length": "1234",
				"content-type": "application/json",
			}),
		);

		expect(headers.get("connection")).toBeNull();
		expect(headers.get("content-encoding")).toBeNull();
		expect(headers.get("content-length")).toBeNull();
		expect(headers.get("content-type")).toBe("application/json");
	});
});
