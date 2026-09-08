import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("loads the production migration config through Drizzle's CommonJS loader", () => {
	const require = createRequire(import.meta.url);
	const cli = resolve(dirname(require.resolve("drizzle-kit")), "bin.cjs");
	// check uses the same config loader as migrate, without connecting to a DB
	// or applying migrations. Keep it outside Vite's module transformations.
	const result = spawnSync(process.execPath, [cli, "check"], {
		cwd: fileURLToPath(new URL("../../", import.meta.url)),
		env: {
			NODE_ENV: "production",
			BETTER_AUTH_SECRET: "migration-test-secret-with-at-least-32-characters",
			DATABASE_URL: "postgres://test:test@127.0.0.1:1/test",
		},
		encoding: "utf8",
		timeout: 10_000,
	});

	expect(result.error).toBeUndefined();
	expect(result.status, result.stdout + result.stderr).toBe(0);
});
