import type { ObservabilityConfig } from "@/lib/observability-shared";
import { getServerEnv } from "@/lib/server-env";

export function getObservabilityConfig(): ObservabilityConfig {
	const env = getServerEnv();

	return {
		errorTrackingEnabled: Boolean(env.POSTHOG_KEY && env.POSTHOG_HOST),
		analyticsEnabled: env.ANALYTICS_ENABLED,
	};
}
