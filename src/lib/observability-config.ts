import type { ObservabilityConfig } from "@/lib/observability-shared";
import { POSTHOG_PROXY_PATH } from "@/lib/posthog-proxy";
import { getServerEnv } from "@/lib/server-env";

export function getObservabilityConfig(): ObservabilityConfig {
	const env = getServerEnv();

	return {
		posthogKey: env.POSTHOG_KEY,
		posthogProxyPath: env.POSTHOG_KEY ? POSTHOG_PROXY_PATH : undefined,
		posthogUIHost: env.POSTHOG_UI_HOST,
	};
}

export function getServerObservabilityConfig(): ObservabilityConfig {
	const env = getServerEnv();

	return {
		posthogHost: env.POSTHOG_HOST,
		posthogKey: env.POSTHOG_KEY,
		posthogProxyPath: env.POSTHOG_KEY ? POSTHOG_PROXY_PATH : undefined,
		posthogUIHost: env.POSTHOG_UI_HOST,
	};
}
