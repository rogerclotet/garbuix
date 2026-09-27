import { useContext, useMemo } from "react";
import { captureBrowserException } from "@/lib/error-tracking-client";
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
				void properties;
				captureBrowserException(error);
			},
		}),
		[enabled],
	);
}
