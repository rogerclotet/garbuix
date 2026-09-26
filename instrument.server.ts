import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Sentry from "@sentry/tanstackstart-react";
import { z } from "zod";
import { glitchtipEnvSchema } from "./src/lib/glitchtip-config.ts";
import { scrubGlitchTipEvent } from "./src/lib/glitchtip-scrub.ts";

const env = glitchtipEnvSchema.parse(process.env);

if (env.GLITCHTIP_DSN && !Sentry.getClient()) {
	const manifestPath =
		process.env.NODE_ENV === "production"
			? "./.output/public/version.json"
			: "./public/version.json";
	let version = "dev";
	try {
		version = z
			.object({ version: z.string() })
			.parse(JSON.parse(readFileSync(resolve(manifestPath), "utf8"))).version;
	} catch {
		// A development checkout need not have a build manifest yet.
		if (process.env.NODE_ENV === "production")
			throw new Error(
				"Missing build version. Run pnpm build before starting the server.",
			);
	}

	Sentry.init({
		dsn: env.GLITCHTIP_DSN,
		environment:
			env.GLITCHTIP_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
		release: `garbuix@${version}`,
		tracesSampleRate: env.GLITCHTIP_TRACES_SAMPLE_RATE,
		enableLogs: env.GLITCHTIP_ENABLE_LOGS,
		sendDefaultPii: false,
		sendClientReports: false,
		beforeSend: scrubGlitchTipEvent,
		beforeSendTransaction: scrubGlitchTipEvent,
		integrations: (defaults) => [
			...defaults.filter((integration) => integration.name !== "HttpSession"),
			// React's streaming SSR renderer logs errors that it handles internally.
			Sentry.captureConsoleIntegration({ levels: ["error"] }),
			...(env.GLITCHTIP_ENABLE_LOGS
				? [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })]
				: []),
		],
		initialScope: { tags: { runtime: "server" } },
	});
	Sentry.registerSentryServerTunnelRoute("/api/monitoring");
	// Let short-lived maintenance jobs deliver queued events before exiting.
	process.once("beforeExit", () => {
		void Sentry.flush(2000);
	});
}
