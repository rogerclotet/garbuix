import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const cli = join(
	dirname(createRequire(import.meta.url).resolve("@posthog/cli/package.json")),
	"run-posthog-cli.js",
);

export function posthogCli(
	args: string[],
	env: NodeJS.ProcessEnv = process.env,
) {
	execFileSync(process.execPath, [cli, ...args], { env, stdio: "inherit" });
}
