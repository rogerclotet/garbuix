import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import SentryCli from "@sentry/cli";
import { loadEnv } from "vite";
import { z } from "zod";

const uploadOnly = process.argv.includes("--upload-only");
const output = resolve(".output");
const clientMaps = join(output, "sourcemaps/client");
const server = join(output, "server");
const manifest = z
	.object({ version: z.string().min(1) })
	.parse(
		JSON.parse(await readFile(join(output, "public/version.json"), "utf8")),
	);
const release = `garbuix@${manifest.version}`;

// Docker mounts this only for the build. Never pass the token in build args,
// compile-time defines or process arguments, where it can persist in images.
let secretEnv: ReturnType<typeof parseEnv> = {};
try {
	secretEnv = parseEnv(await readFile("/run/secrets/glitchtip_env", "utf8"));
} catch (error) {
	if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
		throw error;
}
const env = {
	...loadEnv("production", process.cwd(), "GLITCHTIP_"),
	...secretEnv,
	...process.env,
};
const cliPath = SentryCli.getPath();

if (!uploadOnly) {
	// Inject into the FINAL Nitro output, after both bundlers have finished.
	// The deployed JS and uploaded maps must contain the same debug IDs.
	execFileSync(
		cliPath,
		[
			"sourcemaps",
			"inject",
			"--quiet",
			"--ignore",
			"**/node_modules/**",
			server,
		],
		{ stdio: "inherit" },
	);
}

if (!env.GLITCHTIP_AUTH_TOKEN && !uploadOnly) {
	console.info(
		"GlitchTip: source maps prepared privately; upload skipped without GLITCHTIP_AUTH_TOKEN.",
	);
} else {
	const config = z
		.object({
			GLITCHTIP_URL: z.url({ protocol: /^https?$/ }),
			GLITCHTIP_ORG: z.string().min(1),
			GLITCHTIP_PROJECT: z.string().min(1),
			GLITCHTIP_AUTH_TOKEN: z.string().min(1),
		})
		.parse(env);
	const cliEnv = {
		...process.env,
		SENTRY_URL: config.GLITCHTIP_URL,
		SENTRY_ORG: config.GLITCHTIP_ORG,
		SENTRY_PROJECT: config.GLITCHTIP_PROJECT,
		SENTRY_AUTH_TOKEN: config.GLITCHTIP_AUTH_TOKEN,
	};
	// Upload failures fail the build, so deployment keeps the previous release.
	execFileSync(cliPath, ["releases", "new", release], {
		env: cliEnv,
		stdio: "inherit",
	});
	execFileSync(
		cliPath,
		[
			"sourcemaps",
			"upload",
			"--release",
			release,
			"--validate",
			"--ignore",
			"**/node_modules/**",
			clientMaps,
			server,
		],
		{ env: cliEnv, stdio: "inherit" },
	);
	execFileSync(cliPath, ["releases", "finalize", release], {
		env: cliEnv,
		stdio: "inherit",
	});
}
