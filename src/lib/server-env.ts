import { z } from "zod";

const optionalEnvString = z.preprocess(
	(value) =>
		typeof value === "string" && value.length === 0 ? undefined : value,
	z.string().min(1).optional(),
);

// The value shipped in .env.example and used by the Compose dev stack. It is
// public, so it may never sign sessions in production — see authSecretSchema.
const DEV_AUTH_SECRET = "dev-secret-change-me-please-replace-1234";
const MIN_PRODUCTION_SECRET_LENGTH = 32;

const isProduction = process.env.NODE_ENV === "production";

// Outside production a missing secret falls back to the shared dev value so
// `pnpm dev` works with no .env at all. In production there is no fallback: a
// missing (or publicly known) secret means anyone can forge a session cookie,
// so the process refuses to boot rather than starting quietly insecure.
const authSecretSchema = isProduction
	? z
			.string({
				error:
					"BETTER_AUTH_SECRET is required in production. Generate one with `openssl rand -base64 32`.",
			})
			.min(
				MIN_PRODUCTION_SECRET_LENGTH,
				`BETTER_AUTH_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
			)
			.refine((value) => value !== DEV_AUTH_SECRET, {
				error:
					"BETTER_AUTH_SECRET is still the public development secret. Generate a real one with `openssl rand -base64 32`.",
			})
	: z.string().min(1).default(DEV_AUTH_SECRET);

const serverEnvSchema = z.object({
	BETTER_AUTH_SECRET: authSecretSchema,
	DATABASE_URL: z
		.string()
		.min(1)
		.default("postgres://postgres:postgres@localhost:5432/paraules"),
	GOOGLE_CLIENT_ID: optionalEnvString,
	GOOGLE_CLIENT_SECRET: optionalEnvString,
	POSTHOG_HOST: z.string().url().optional(),
	POSTHOG_KEY: optionalEnvString,
	POSTHOG_UI_HOST: z.string().url().optional(),
	REDIS_URL: optionalEnvString,
	ANTHROPIC_API_KEY: optionalEnvString,
});

let cachedServerEnv: z.infer<typeof serverEnvSchema> | null = null;

export function getServerEnv() {
	if (!cachedServerEnv) {
		const parsed = serverEnvSchema.safeParse(process.env);

		if (!parsed.success) {
			// Surface which variables are wrong instead of a raw Zod dump: this
			// throws during boot, so the message is all an operator gets.
			const problems = parsed.error.issues
				.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
				.join("\n");
			throw new Error(`Invalid server environment:\n${problems}`);
		}

		cachedServerEnv = parsed.data;
	}

	return cachedServerEnv;
}
