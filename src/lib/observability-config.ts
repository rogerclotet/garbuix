import type { ObservabilityConfig } from "@/lib/observability-shared";
import { POSTHOG_PROXY_PATH } from "@/lib/posthog-proxy";
import { getServerEnv } from "@/lib/server-env";

export function getObservabilityConfig(): ObservabilityConfig {
	const env = getServerEnv();

	return {
		posthogKey: env.POSTHOG_KEY,
		posthogProxyPath: env.POSTHOG_KEY ? POSTHOG_PROXY_PATH : undefined,
		posthogUIHost: env.POSTHOG_UI_HOST,
		umamiEnabled: Boolean(env.UMAMI_HOST && env.UMAMI_WEBSITE_ID),
	};
}

export function getServerObservabilityConfig() {
	const env = getServerEnv();

	return {
		posthogHost: env.POSTHOG_HOST,
		posthogKey: env.POSTHOG_KEY,
		posthogProxyPath: env.POSTHOG_KEY ? POSTHOG_PROXY_PATH : undefined,
		posthogUIHost: env.POSTHOG_UI_HOST,
		umami:
			env.UMAMI_HOST && env.UMAMI_WEBSITE_ID
				? { host: env.UMAMI_HOST, websiteId: env.UMAMI_WEBSITE_ID }
				: undefined,
	};
}
