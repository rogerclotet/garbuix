// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { captureBrowserException } from "./error-tracking-client";
import {
	ERROR_TRACKING_CONFIG_ID,
	serializeErrorTrackingConfig,
} from "./error-tracking-config";

it("captures browser errors and rejections before React without tracking state or credentials", async () => {
	const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
	vi.stubGlobal("fetch", fetch);
	captureBrowserException(new Error("Disabled"));
	expect(fetch).not.toHaveBeenCalled();
	const script = document.createElement("script");
	script.type = "application/json";
	script.id = ERROR_TRACKING_CONFIG_ID;
	script.textContent = serializeErrorTrackingConfig(true);
	document.head.append(script);
	await import("../instrument.client");
	const error = new Error("Browser failure private@example.com");
	const event = new ErrorEvent("error", { error, cancelable: true });
	event.preventDefault();
	window.dispatchEvent(event);
	captureBrowserException(error);
	const rejection = new Event("unhandledrejection");
	Object.defineProperty(rejection, "reason", {
		value: new Error("Rejected promise"),
	});
	window.dispatchEvent(rejection);
	expect(fetch).toHaveBeenCalledTimes(2);
	const [url, options] = fetch.mock.calls[0];
	expect(url).toBe("/api/monitoring");
	expect(options).toMatchObject({
		credentials: "omit",
		referrerPolicy: "no-referrer",
		cache: "no-store",
		headers: { "Content-Type": "application/json" },
	});
	expect(JSON.parse(options.body).exceptions[0]).toMatchObject({
		type: "Error",
		value: "Browser failure [email]",
		mechanism: { handled: false },
	});
	expect(options.body).not.toMatch(
		/distinct_id|session_id|user_id|device_id|private@example/,
	);
	expect(document.cookie).toBe("");
	vi.unstubAllGlobals();
	script.remove();
});
