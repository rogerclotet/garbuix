import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";
import { posthogEnvSchema } from "./src/lib/error-tracking-config.ts";
import {
	createErrorReporter,
	getErrorReporter,
} from "./src/lib/error-tracking.server.ts";

if (existsSync(".env")) loadEnvFile(".env");
const env = posthogEnvSchema.parse(process.env);
if (env.POSTHOG_KEY && env.POSTHOG_HOST && !getErrorReporter()) {
	const manifestPath =
		process.env.NODE_ENV === "production"
			? ".output/public/version.json"
			: "public/version.json";
	let version = "dev";
	try {
		version = z
			.object({ version: z.string() })
			.parse(JSON.parse(readFileSync(manifestPath, "utf8"))).version;
	} catch {
		if (process.env.NODE_ENV === "production")
			throw new Error(
				"Missing build version. Run pnpm build before starting the server.",
			);
	}
	const reporter = createErrorReporter({
		key: env.POSTHOG_KEY,
		host: env.POSTHOG_HOST,
		environment:
			env.POSTHOG_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
		release: `garbuix@${version}`,
	});
	globalThis.__garbuixErrorReporter = reporter;
	const originalConsoleError = console.error.bind(console);
	console.error = (...args: unknown[]) => {
		originalConsoleError(...args);
		// React's streaming renderer handles some errors internally and logs them.
		// Never serialize arbitrary log arguments, which may contain request data.
		const error = args.find((value) => value instanceof Error);
		if (error) reporter.capture(error);
	};
	// Unhandled rejections become uncaught exceptions under Node's default mode.
	// Preserve a failing process exit after allowing the report to finish.
	process.on("uncaughtException", async (error) => {
		originalConsoleError(error);
		reporter.capture(error, false);
		await reporter.flush();
		process.exit(1);
	});
	process.once("beforeExit", () => {
		void reporter.flush();
	});
}
