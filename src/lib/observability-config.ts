import type { ObservabilityConfig } from "@/lib/observability-shared";
import { POSTHOG_PROXY_PATH } from "@/lib/posthog-proxy";
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
		posthogKey: env.POSTHOG_KEY,
		posthogProxyPath: env.POSTHOG_KEY ? POSTHOG_PROXY_PATH : undefined,
		posthogUIHost: env.POSTHOG_UI_HOST,
	};
}

export function getServerObservabilityConfig() {
	const env = getServerEnv();

	return {
		posthogHost: env.POSTHOG_HOST,
		posthogKey: env.POSTHOG_KEY,
		posthogProxyPath: env.POSTHOG_KEY ? POSTHOG_PROXY_PATH : undefined,
		posthogUIHost: env.POSTHOG_UI_HOST,
	};
}
