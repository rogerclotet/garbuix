import { z } from "zod";

const optionalEnvString = z.preprocess(
	(value) =>
		typeof value === "string" && value.length === 0 ? undefined : value,
	z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
	BETTER_AUTH_SECRET: z
		.string()
		.min(1)
		.default("dev-secret-change-me-please-replace-1234"),
	BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
	DATABASE_URL: z
		.string()
		.min(1)
		.default("postgres://postgres:postgres@localhost:5432/paraules"),
	GOOGLE_CLIENT_ID: optionalEnvString,
	GOOGLE_CLIENT_SECRET: optionalEnvString,
});

let cachedServerEnv: z.infer<typeof serverEnvSchema> | null = null;

export function getServerEnv() {
	if (!cachedServerEnv) {
		cachedServerEnv = serverEnvSchema.parse(process.env);
	}

	return cachedServerEnv;
}
