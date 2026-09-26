import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEV_AUTH_SECRET = "dev-secret-change-me-please-replace-1234";
const REAL_SECRET = "n0Jd2xQ8pR6vL1wZ4tYh7bK3mC5sA9eG";

// The schema branches on NODE_ENV at module load, and the parsed result is
// cached in module scope, so every case needs a fresh module registry.
async function loadServerEnv(env: Record<string, string | undefined>) {
	vi.resetModules();
	process.env = { ...env } as NodeJS.ProcessEnv;
	const { getServerEnv } = await import("@/lib/server-env");
	return getServerEnv;
}

describe("getServerEnv", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetModules();
	});

	it("falls back to the shared dev secret outside production", async () => {
		const getServerEnv = await loadServerEnv({ NODE_ENV: "development" });

		expect(getServerEnv().BETTER_AUTH_SECRET).toBe(DEV_AUTH_SECRET);
	});

	it("refuses to boot in production without a secret", async () => {
		const getServerEnv = await loadServerEnv({ NODE_ENV: "production" });

		expect(() => getServerEnv()).toThrow(/BETTER_AUTH_SECRET/);
	});

	it("refuses the public dev secret in production", async () => {
		const getServerEnv = await loadServerEnv({
			NODE_ENV: "production",
			BETTER_AUTH_SECRET: DEV_AUTH_SECRET,
		});

		expect(() => getServerEnv()).toThrow(/development secret/);
	});

	it("refuses a production secret that is too short to be random", async () => {
		const getServerEnv = await loadServerEnv({
			NODE_ENV: "production",
			BETTER_AUTH_SECRET: "short",
		});

		expect(() => getServerEnv()).toThrow(/at least 32 characters/);
	});

	it("accepts a real production secret", async () => {
		const getServerEnv = await loadServerEnv({
			NODE_ENV: "production",
			BETTER_AUTH_SECRET: REAL_SECRET,
		});

		expect(getServerEnv().BETTER_AUTH_SECRET).toBe(REAL_SECRET);
	});

	it("accepts optional Umami settings and treats blanks as disabled", async () => {
		const getServerEnv = await loadServerEnv({
			UMAMI_HOST: "",
			UMAMI_WEBSITE_ID: "",
		});
		expect(getServerEnv().UMAMI_HOST).toBeUndefined();
		expect(getServerEnv().UMAMI_WEBSITE_ID).toBeUndefined();
	});

	it("validates Umami URLs and website IDs at startup", async () => {
		const getServerEnv = await loadServerEnv({
			UMAMI_HOST: "javascript:alert(1)",
			UMAMI_WEBSITE_ID: "not-a-uuid",
		});
		expect(() => getServerEnv()).toThrow(/UMAMI_HOST/);
		expect(() => getServerEnv()).toThrow(/UMAMI_WEBSITE_ID/);
	});

	it.each([
		[undefined, undefined, false],
		["https://analytics.example.com", undefined, false],
		[undefined, "e676c9b4-11e4-4ef1-a4d7-87001773e9f2", false],
		[
			"https://analytics.example.com",
			"e676c9b4-11e4-4ef1-a4d7-87001773e9f2",
			true,
		],
	])(
		"enables Umami only with both settings: %s, %s",
		async (host, websiteId, enabled) => {
			await loadServerEnv({ UMAMI_HOST: host, UMAMI_WEBSITE_ID: websiteId });
			const { getObservabilityConfig, getServerObservabilityConfig } =
				await import("@/lib/observability-config");
			expect(getObservabilityConfig().umamiEnabled).toBe(enabled);
			expect(getObservabilityConfig()).not.toHaveProperty("umami");
			expect(getServerObservabilityConfig().umami).toEqual(
				enabled ? { host, websiteId } : undefined,
			);
		},
	);
});
