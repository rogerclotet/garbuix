import { afterEach, expect, it, vi } from "vitest";
import { forgetCachedPages } from "@/lib/page-cache";

afterEach(() => {
	vi.unstubAllGlobals();
});

function fakeCache(urls: string[]) {
	const entries = new Set(urls);
	return {
		entries,
		keys: async () => [...entries].map((url) => new Request(url)),
		delete: async (request: Request) => entries.delete(request.url),
	};
}

it("drops cached pages and keeps cached assets", async () => {
	const origin = "https://garbuix.app";
	const runtime = fakeCache([
		`${origin}/`,
		`${origin}/mini`,
		`${origin}/dies-anteriors?mes=2026-10`,
		`${origin}/assets/index-abc123.js`,
		`${origin}/assets/nunito-latin.woff2`,
		`${origin}/icons/favicon-196.png`,
		`${origin}/manifest.json`,
	]);
	const precache = fakeCache([`${origin}/offline.html`, `${origin}/`]);
	const stores: Record<string, ReturnType<typeof fakeCache>> = {
		"paraules-runtime-v1": runtime,
		"paraules-static-v1": precache,
	};
	vi.stubGlobal("caches", {
		keys: async () => Object.keys(stores),
		open: async (name: string) => stores[name],
	});

	await forgetCachedPages();

	expect([...runtime.entries]).toEqual([
		`${origin}/assets/index-abc123.js`,
		`${origin}/assets/nunito-latin.woff2`,
		`${origin}/icons/favicon-196.png`,
		`${origin}/manifest.json`,
	]);
	expect(precache.entries.size).toBe(2);
});
