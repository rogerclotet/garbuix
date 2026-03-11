import type { ObservabilityConfig } from "@/lib/observability-shared";
import { getServerEnv } from "@/lib/server-env";

export function getObservabilityConfig(): ObservabilityConfig {
	const env = getServerEnv();

	return {
		posthogHost: env.POSTHOG_HOST,
		posthogKey: env.POSTHOG_KEY,
		posthogUIHost: env.POSTHOG_UI_HOST,
	};
}
