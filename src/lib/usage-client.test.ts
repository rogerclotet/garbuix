// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { captureUsage, clearLegacyPostHogStorage } from "./usage-client";

beforeEach(() => {
	window.history.replaceState(null, "", "/mini?account=private#secret");
	// Use real jsdom Storage from a child realm. Node 25 exposes an incomplete
	// global localStorage which otherwise shadows jsdom in Vitest.
	const frame = document.createElement("iframe");
	document.body.append(frame);
	if (!frame.contentWindow) throw new Error("Missing iframe window");
	vi.stubGlobal("localStorage", frame.contentWindow.localStorage);
	vi.stubGlobal("sessionStorage", frame.contentWindow.sessionStorage);
});
afterEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

it("sends only an action, page and option without cookies, referrer, or tracking headers", () => {
	const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
	vi.stubGlobal("fetch", fetch);
	captureUsage({ event: "hint_requested", value: "letter" });
	expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/usage", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: '{"event":"hint_requested","page":"mini","value":"letter"}',
		credentials: "omit",
		referrerPolicy: "no-referrer",
		cache: "no-store",
		keepalive: true,
	});
	expect(window.localStorage.length).toBe(0);
	expect(window.sessionStorage.length).toBe(0);
});

it("uses the router destination even before the browser URL has changed", () => {
	window.history.replaceState(null, "", "/privacitat");
	const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
	vi.stubGlobal("fetch", fetch);
	captureUsage({ event: "page_view" }, "/preferencies");
	expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
		event: "page_view",
		page: "preferences",
	});
});

it("removes only legacy PostHog state, including session metadata and domain cookies", () => {
	window.localStorage.setItem("ph_phc_old_posthog", "private identity");
	window.sessionStorage.setItem("ph_phc_old_posthog", "old-session");
	window.sessionStorage.setItem("ph_phc_old_primary_window_exists", "true");
	window.localStorage.setItem("__ph_opt_in_out_phc_old", "1");
	window.localStorage.setItem("game-save", "keep");
	// biome-ignore lint/suspicious/noDocumentCookie: Fixture for legacy cookie cleanup.
	document.cookie = "ph_phc_old_posthog=private; Path=/";
	// biome-ignore lint/suspicious/noDocumentCookie: Verify unrelated cookies survive cleanup.
	document.cookie = "app-session=keep; Path=/";
	clearLegacyPostHogStorage();
	expect(Object.keys(window.localStorage)).toEqual(["game-save"]);
	expect(window.sessionStorage.length).toBe(0);
	expect(document.cookie).not.toContain("ph_phc");
	expect(document.cookie).toContain("app-session=keep");
});
