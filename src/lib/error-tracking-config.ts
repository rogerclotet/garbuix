import { z } from "zod";

const optionalString = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.string().min(1).optional(),
);

// Shared with the Node preload; do not import application modules here.
export const posthogEnvSchema = z.object({
	POSTHOG_KEY: optionalString,
	POSTHOG_HOST: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z.url({ protocol: /^https?$/ }).optional(),
	),
	POSTHOG_ENVIRONMENT: optionalString,
});

export const ERROR_TRACKING_CONFIG_ID = "error-tracking-config";
export const ERROR_TRACKING_PATH = "/api/monitoring";
export const errorTrackingClientConfigSchema = z.strictObject({
	enabled: z.boolean(),
});

export function serializeErrorTrackingConfig(enabled: boolean) {
	return JSON.stringify({ enabled });
}
