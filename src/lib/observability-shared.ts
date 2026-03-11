import type { SessionUser } from "@/lib/puzzle-types";

export type ObservabilityConfig = {
	posthogHost?: string;
	posthogKey?: string;
	posthogUIHost?: string;
};

export type ObservabilityUser = Exclude<SessionUser, null>;

export function isObservabilityEnabled(config: ObservabilityConfig) {
	return Boolean(config.posthogKey && config.posthogHost);
}

export function buildUserProperties(user: ObservabilityUser) {
	return {
		email: user.email,
		name: user.name,
		avatar: user.image ?? undefined,
	};
}

export function toEventProperties(
	properties?: Record<string, unknown>,
): Record<string, string | number | boolean | string[] | null> | undefined {
	if (!properties) {
		return undefined;
	}

	const entries = Object.entries(properties)
		.map(([key, value]) => [key, sanitizePropertyValue(value)] as const)
		.filter((entry) => entry[1] !== undefined);

	if (entries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(entries);
}

export function buildErrorProperties(
	error: unknown,
	properties?: Record<string, unknown>,
) {
	const errorObject = toError(error);

	return toEventProperties({
		error_message: errorObject.message,
		error_name: errorObject.name,
		error_stack: errorObject.stack ?? null,
		...properties,
	});
}

export function toError(error: unknown) {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "string") {
		return new Error(error);
	}

	return new Error("Unknown error", {
		cause: error,
	});
}

function sanitizePropertyValue(value: unknown) {
	if (value == null) {
		return null;
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (
		Array.isArray(value) &&
		value.every((entry) => typeof entry === "string")
	) {
		return value;
	}

	if (value instanceof Error) {
		return value.message;
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
