import type { PostHog } from "posthog-js";
import type { Metric } from "web-vitals";
import type {
	ObservabilityConfig,
	ObservabilityUser,
} from "@/lib/observability-shared";
import {
	buildErrorProperties,
	buildUserProperties,
	isObservabilityEnabled,
	toEventProperties,
} from "@/lib/observability-shared";

let activeConfig: ObservabilityConfig | null = null;
let posthogPromise: Promise<PostHog | null> | null = null;

export async function initializeClientObservability(
	config: ObservabilityConfig,
) {
	activeConfig = config;
	await getClientPostHog();
}

export async function captureClientEvent(
	event: string,
	properties?: Record<string, unknown>,
) {
	const posthog = await getClientPostHog();
	if (!posthog) {
		return;
	}

	posthog.capture(event, toEventProperties(properties));
}

export async function captureClientException(
	error: unknown,
	properties?: Record<string, unknown>,
) {
	const posthog = await getClientPostHog();
	if (!posthog) {
		return;
	}

	posthog.captureException(error, buildErrorProperties(error, properties));
}

export async function identifyClientUser(user: ObservabilityUser) {
	const posthog = await getClientPostHog();
	if (!posthog) {
		return;
	}

	posthog.identify(user.id, buildUserProperties(user));
}

export async function resetClientUser() {
	const posthog = await getClientPostHog();
	if (!posthog) {
		return;
	}

	posthog.reset();
}

export function toWebVitalProperties(metric: Metric) {
	return {
		delta: metric.delta,
		id: metric.id,
		name: metric.name,
		navigation_type: metric.navigationType,
		rating: metric.rating,
		value: metric.value,
	};
}

async function getClientPostHog() {
	if (typeof window === "undefined") {
		return null;
	}

	if (!activeConfig || !isObservabilityEnabled(activeConfig)) {
		return null;
	}

	if (!posthogPromise) {
		posthogPromise = import("posthog-js").then(({ default: posthog }) => {
			posthog.init(activeConfig?.posthogKey ?? "", {
				api_host: activeConfig?.posthogHost,
				ui_host: activeConfig?.posthogUIHost,
				capture_exceptions: {
					capture_console_errors: false,
					capture_unhandled_errors: true,
					capture_unhandled_rejections: true,
				},
				capture_pageleave: true,
				capture_pageview: false,
				person_profiles: "identified_only",
			});

			return posthog;
		});
	}

	return posthogPromise;
}
