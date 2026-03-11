import { usePostHog } from "@posthog/react";
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
				posthog.captureException(
					error,
					buildErrorProperties(error, properties),
				);
			},
			identifyUser(user: ObservabilityUser) {
				posthog.identify(user.id, buildUserProperties(user));
			},
			resetUser() {
				posthog.reset();
			},
			toWebVitalProperties(metric: Metric) {
				return {
					delta: metric.delta,
					id: metric.id,
					name: metric.name,
					navigation_type: metric.navigationType,
					rating: metric.rating,
					value: metric.value,
				};
			},
		}),
		[posthog],
	);
}
