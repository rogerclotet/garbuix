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
				const properties = buildUserProperties(user);
				posthog.identify(user.id, properties);

				// Flags targeted by person property (e.g. "enabled for these emails")
				// are evaluated server-side against the person record, which is
				// updated asynchronously after identify() ingests. Without this, the
				// very next flag check can race that ingestion and see a person who
				// doesn't have the property yet, so the flag reads as off on some
				// devices/browsers until the property eventually lands. Overriding it
				// locally makes the property available for evaluation immediately.
				posthog.setPersonPropertiesForFlags(properties);
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
