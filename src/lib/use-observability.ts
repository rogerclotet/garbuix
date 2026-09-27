import * as Sentry from "@sentry/tanstackstart-react";
import { useContext, useMemo } from "react";
import { captureUsage } from "@/lib/usage-client";
import { UsageEnabledContext } from "@/lib/usage-context";
import type { UsageAction } from "@/lib/usage-events";

export function useObservability() {
	const enabled = useContext(UsageEnabledContext);
	return useMemo(
		() => ({
			captureEvent(action: UsageAction) {
				if (enabled) captureUsage(action);
			},
			captureException(error: unknown, properties?: Record<string, unknown>) {
				Sentry.captureException(error, { extra: properties });
			},
		}),
		[enabled],
	);
}
