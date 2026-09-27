import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");
const { getServerEnv } = await import("../src/lib/server-env");
const { sql } = await import("../src/lib/db");
const { exportDailyUsage } = await import("../src/lib/usage-export.server");
const env = getServerEnv();
try {
	const destination =
		env.ANALYTICS_ENABLED && env.POSTHOG_HOST && env.POSTHOG_KEY
			? { host: env.POSTHOG_HOST, key: env.POSTHOG_KEY }
			: undefined;
	const count = await exportDailyUsage(sql, destination);
	process.stdout.write(
		`Exported ${count} daily usage buckets. Retention cleanup complete.\n`,
	);
} catch {
	// Do not log HTTP bodies, credentials, database parameters, or SDK context.
	process.stderr.write(
		"Daily usage export failed. Pending buckets will retry next run.\n",
	);
	process.exitCode = 1;
} finally {
	await sql.end();
}
