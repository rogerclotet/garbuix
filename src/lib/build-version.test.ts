import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("generates a build version from a clean checkout without APP_VERSION", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const checkout = mkdtempSync(join(tmpdir(), "garbuix-build-version-"));
	try {
		// Run the real prebuild script in isolation, without requiring Git or
		// a database in the Node container used by CI.
		for (const file of [
			"src",
			"public",
			"package.json",
			"pnpm-lock.yaml",
			"vite.config.ts",
			"scripts/write-build-version.ts",
		]) {
			const destination = join(checkout, file);
			mkdirSync(dirname(destination), { recursive: true });
			cpSync(join(root, file), destination, { recursive: true });
		}
		rmSync(join(checkout, "public/version.json"), { force: true });
		const env = { ...process.env };
		delete env.APP_VERSION;
		const result = spawnSync(
			process.execPath,
			["scripts/write-build-version.ts"],
			{
				cwd: checkout,
				env,
				encoding: "utf8",
				timeout: 10_000,
			},
		);
		expect(result.error).toBeUndefined();
		expect(result.status, result.stdout + result.stderr).toBe(0);
		expect(
			JSON.parse(readFileSync(join(checkout, "public/version.json"), "utf8")),
		).toEqual({
			version: expect.stringMatching(/^[a-f0-9]{16}$/),
			serviceWorkerVersion: expect.stringMatching(/^[a-f0-9]{16}$/),
		});
	} finally {
		rmSync(checkout, { recursive: true, force: true });
	}
});
