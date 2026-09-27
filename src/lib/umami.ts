import { createContext } from "react";
import type { Metric } from "web-vitals";
import { z } from "zod";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import {
	toUmamiPath,
	toUmamiProperties,
	umamiEventName,
} from "@/lib/umami-events";
import {
	type UmamiMessage,
	umamiPerformancePayload,
} from "@/lib/umami-messages";

export const UMAMI_PROXY_PATH = "/api/u";

export const UmamiContext = createContext<ReturnType<
	typeof createUmamiClient
> | null>(null);

// Send directly to the collection API so events emitted during hydration do
// not have to wait for an external tracker script to load.
export function createUmamiClient() {
	let cache: string | undefined;
	function send(message: UmamiMessage) {
		if (typeof window === "undefined") return;

		return fetch(UMAMI_PROXY_PATH, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(cache ? { "x-umami-cache": cache } : {}),
			},
			credentials: "omit",
			referrerPolicy: "no-referrer",
			keepalive: true,
			body: JSON.stringify(message),
		})
			.then(async (response) => {
				if (!response.ok) return;
				const result = z
					.object({ cache: z.string().optional() })
					.safeParse(await response.json());
				if (result.success && result.data.cache) cache = result.data.cache;
			})
			.catch(() => {
				// Analytics must never interrupt gameplay, including offline play.
			});
	}

	return {
		captureEvent(event: string, properties?: Record<string, unknown>) {
			if (typeof window === "undefined") return;
			const parsed = umamiEventName.safeParse(event);
			if (!parsed.success) return;
			// Umami counts events without a name as pageviews.
			return send({
				type: "event",
				payload: {
					url: toUmamiPath(window.location.pathname),
					name:
						parsed.data === ANALYTICS_EVENT.PAGEVIEW ? undefined : parsed.data,
					data: toUmamiProperties(properties),
				},
			});
		},
		captureWebVital(metric: Pick<Metric, "name" | "value">, pathname: string) {
			const payload = umamiPerformancePayload.safeParse({
				url: toUmamiPath(pathname),
				[metric.name.toLowerCase()]: metric.value,
			});
			if (!payload.success) return;
			return send({ type: "performance", payload: payload.data });
		},
	};
}
