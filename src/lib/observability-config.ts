import type { ObservabilityConfig } from "@/lib/observability-shared";
import { getServerEnv } from "@/lib/server-env";

export function getObservabilityConfig(): ObservabilityConfig {
	const env = getServerEnv();

	return {
		glitchtip: env.GLITCHTIP_DSN
			? {
					dsn: env.GLITCHTIP_DSN,
					environment:
						env.GLITCHTIP_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
					tracesSampleRate: env.GLITCHTIP_TRACES_SAMPLE_RATE,
					enableLogs: env.GLITCHTIP_ENABLE_LOGS,
				}
			: undefined,
		analyticsEnabled: env.ANALYTICS_ENABLED,
	};
}
