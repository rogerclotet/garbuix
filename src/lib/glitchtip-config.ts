import { z } from "zod";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const glitchtipDsnSchema = z
	.url({ protocol: /^https?$/ })
	.refine((value) => {
		const url = new URL(value);
		return (
			Boolean(url.username) &&
			!url.password &&
			/\/\d+$/.test(url.pathname) &&
			!url.search &&
			!url.hash
		);
	}, "Expected a GlitchTip public DSN, including its key and numeric project ID");

// Shared by the Node preload and runtime config. No application imports here:
// instrumentation must initialize before the server imports its dependencies.
export const glitchtipEnvSchema = z.object({
	GLITCHTIP_DSN: z.preprocess(blankToUndefined, glitchtipDsnSchema.optional()),
	GLITCHTIP_ENVIRONMENT: z.preprocess(
		blankToUndefined,
		z.string().min(1).optional(),
	),
	GLITCHTIP_TRACES_SAMPLE_RATE: z.preprocess(
		blankToUndefined,
		z.coerce.number().min(0).max(1).default(0.1),
	),
	GLITCHTIP_ENABLE_LOGS: z
		.preprocess(blankToUndefined, z.enum(["true", "false"]).default("false"))
		.transform((value) => value === "true"),
});

export const glitchtipClientConfigSchema = z.object({
	dsn: glitchtipDsnSchema,
	environment: z.string(),
	tracesSampleRate: z.number().min(0).max(1),
	enableLogs: z.boolean(),
});

export type GlitchTipClientConfig = z.infer<typeof glitchtipClientConfigSchema>;
export const GLITCHTIP_CONFIG_ID = "glitchtip-config";
export const GLITCHTIP_TUNNEL_PATH = "/api/monitoring";

export function serializeGlitchTipConfig(
	config: GlitchTipClientConfig | undefined,
) {
	// A JSON script element still ends at </script>, even with application/json.
	return JSON.stringify(config ?? null).replace(/</g, "\\u003c");
}
