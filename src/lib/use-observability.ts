import { usePostHog } from "@posthog/react";
import * as Sentry from "@sentry/tanstackstart-react";
import { useMemo } from "react";
import type { Metric } from "web-vitals";
import {
	buildErrorProperties,
	buildUserProperties,
	type ObservabilityUser,
	toEventProperties,
} from "@/lib/observability-shared";

export function useObservability() {
	const posthog = usePostHog();

	return useMemo(
		() => ({
			captureEvent(event: string, properties?: Record<string, unknown>) {
				posthog.capture(event, toEventProperties(properties));
			},
			captureException(error: unknown, properties?: Record<string, unknown>) {
				Sentry.captureException(error, { extra: properties });
				posthog.captureException(
					error,
					buildErrorProperties(error, properties),
				);
			},
			identifyUser(user: ObservabilityUser) {
				const properties = buildUserProperties(user);
				posthog.identify(user.id, properties);
			},
			resetUser() {
				posthog.reset();
			},
			captureWebVital(metric: Metric) {
				posthog.capture("web_vital", {
					delta: metric.delta,
					id: metric.id,
					name: metric.name,
					navigation_type: metric.navigationType,
					rating: metric.rating,
					value: metric.value,
				});
			},
		}),
		[posthog],
	);
}
