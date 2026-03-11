import { PostHog } from "posthog-node";
import { getObservabilityConfig } from "@/lib/observability-config";
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

	try {
		return await action();
	} catch (error) {
		captureServerException(error, {
			distinctId: options?.distinctId,
			properties: {
				action: name,
				duration_ms: Date.now() - startedAt,
				...options?.properties,
			},
		});
		throw error;
	}
}

function getServerPostHog() {
	if (posthogClient !== undefined) {
		return posthogClient;
	}

	const config = getObservabilityConfig();
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
