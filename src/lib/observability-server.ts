import { getRequestHeaders } from "@tanstack/react-start/server";
import { PostHog } from "posthog-node";
import { getServerObservabilityConfig } from "@/lib/observability-config";
import {
	buildErrorProperties,
	isObservabilityEnabled,
	toEventProperties,
} from "@/lib/observability-shared";

let posthogClient: PostHog | null | undefined;

export function captureServerEvent(options: {
	event: string;
	distinctId?: string;
	properties?: Record<string, unknown>;
}) {
	const client = getServerPostHog();
	if (!client) {
		return;
	}

	client.capture({
		distinctId: options.distinctId,
		event: options.event,
		properties: toEventProperties(options.properties),
	});
}

export function captureServerException(
	error: unknown,
	options?: {
		distinctId?: string;
		properties?: Record<string, unknown>;
	},
) {
	const client = getServerPostHog();
	if (!client) {
		return;
	}

	client.captureException(
		error,
		options?.distinctId,
		buildErrorProperties(error, options?.properties),
	);
}

export async function observeServerAction<T>(
	name: string,
	action: () => Promise<T>,
	options?: {
		distinctId?: string;
		properties?: Record<string, unknown>;
	},
) {
	const startedAt = Date.now();
	const client = getServerPostHog();
	const context = getRequestObservabilityContext(options);

	try {
		if (!client) {
			return await action();
		}

		return await client.withContext(context, action);
	} catch (error) {
		captureServerException(error, {
			distinctId: context.distinctId,
			properties: {
				action: name,
				duration_ms: Date.now() - startedAt,
				...context.properties,
			},
		});
		throw error;
	}
}

function getServerPostHog() {
	if (posthogClient !== undefined) {
		return posthogClient;
	}

	const config = getServerObservabilityConfig();
	if (!isObservabilityEnabled(config)) {
		posthogClient = null;
		return posthogClient;
	}

	posthogClient = new PostHog(config.posthogKey ?? "", {
		enableExceptionAutocapture: true,
		host: config.posthogHost,
	});

	return posthogClient;
}

function getRequestObservabilityContext(options?: {
	distinctId?: string;
	properties?: Record<string, unknown>;
}) {
	const headers = getRequestHeaders();
	const distinctId =
		options?.distinctId ?? headers["x-posthog-distinct-id"] ?? undefined;
	const sessionId = headers["x-posthog-session-id"] ?? undefined;
	const windowId = headers["x-posthog-window-id"] ?? undefined;

	return {
		distinctId,
		properties: {
			...options?.properties,
			posthog_window_id: windowId,
		},
		sessionId,
	};
}
