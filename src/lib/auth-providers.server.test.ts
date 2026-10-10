import { describe, expect, it } from "vitest";
import { buildAuthProviderConfig } from "@/lib/auth-providers.server";
import { logSignInCode } from "@/lib/sign-in-email.server";

type Env = Parameters<typeof buildAuthProviderConfig>[0];

function env(overrides: Partial<Env> = {}): Env {
	return {
		BETTER_AUTH_SECRET: "secret",
		DATABASE_URL: "postgres://localhost/test",
		EMAIL_FROM: "Garbuix <codi@garbuix.app>",
		...overrides,
	};
}

const google: Partial<Env> = {
	GOOGLE_CLIENT_ID: "google-id",
	GOOGLE_CLIENT_SECRET: "google-secret",
};

describe("buildAuthProviderConfig", () => {
	it("offers Google and email codes once both are configured", () => {
		const config = buildAuthProviderConfig(
			env({ ...google, RESEND_API_KEY: "re_test" }),
			{ isProduction: true },
		);

		expect(config.enabledMethods).toEqual(["google", "email"]);
		expect(Object.keys(config.socialProviders)).toEqual(["google"]);
		expect(config.signInCodeMailer).not.toBeNull();
	});

	it("leaves out Google when a credential is missing", () => {
		const config = buildAuthProviderConfig(
			env({ GOOGLE_CLIENT_ID: "google-id", RESEND_API_KEY: "re_test" }),
			{ isProduction: true },
		);

		expect(config.enabledMethods).toEqual(["email"]);
		expect(config.socialProviders.google).toBeUndefined();
	});

	it("hides email codes in production without a mail provider", () => {
		const config = buildAuthProviderConfig(env(google), {
			isProduction: true,
		});

		expect(config.enabledMethods).toEqual(["google"]);
		expect(config.signInCodeMailer).toBeNull();
	});

	it("logs email codes in development without a mail provider", () => {
		const config = buildAuthProviderConfig(env(), { isProduction: false });

		expect(config.enabledMethods).toEqual(["email"]);
		expect(config.signInCodeMailer).toBe(logSignInCode);
	});
});
