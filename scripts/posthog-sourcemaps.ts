import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { loadEnv } from "vite";
import { z } from "zod";
import { posthogCli } from "./posthog-cli.ts";
import { injectPostHogSourceMaps } from "./posthog-inject.ts";

const uploadOnly = process.argv.includes("--upload-only");
const output = resolve(".output");
const client = join(output, "sourcemaps/client");
const server = join(output, "server");
const { version } = z
	.object({ version: z.string().min(1) })
	.parse(
		JSON.parse(await readFile(join(output, "public/version.json"), "utf8")),
	);
let secretEnv: ReturnType<typeof parseEnv> = {};
try {
	secretEnv = parseEnv(await readFile("/run/secrets/posthog_env", "utf8"));
} catch (error) {
	if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
		throw error;
}
const env = {
	...loadEnv("production", process.cwd(), "POSTHOG_CLI_"),
	...secretEnv,
	...process.env,
};

if (!uploadOnly) {
	// Inject the FINAL Nitro output. Client injection happens before Nitro
	// calculates asset sizes/ETags and removes maps from the public directory.
	await injectPostHogSourceMaps(server);
}
if (!env.POSTHOG_CLI_API_KEY && !uploadOnly) {
	console.info(
		"PostHog: source maps prepared privately; upload skipped without POSTHOG_CLI_API_KEY.",
	);
} else {
	const config = z
		.object({
			POSTHOG_CLI_HOST: z.url({ protocol: /^https?$/ }),
			POSTHOG_CLI_PROJECT_ID: z.string().regex(/^\d+$/),
			POSTHOG_CLI_API_KEY: z.string().min(1),
		})
		.parse(env);
	for (const directory of [client, server]) {
		posthogCli(
			[
				"sourcemap",
				"upload",
				"--directory",
				directory,
				"--exclude",
				"**/node_modules/**",
				"--release-mode",
				"symbol-set",
				"--release-name",
				"garbuix",
				"--release-version",
				version,
			],
			{ ...process.env, ...config },
		);
	}
}
