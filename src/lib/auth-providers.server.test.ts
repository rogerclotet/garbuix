import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAuthProviderConfig } from "@/lib/auth-providers.server";
import { logSignInCode } from "@/lib/sign-in-email.server";

const applePrivateKey = generateKeyPairSync("ec", { namedCurve: "P-256" })
	.privateKey.export({ format: "pem", type: "pkcs8" })
	.toString();

type Env = Parameters<typeof buildAuthProviderConfig>[0];

function env(overrides: Partial<Env> = {}): Env {
	return {
		BETTER_AUTH_SECRET: "secret",
		DATABASE_URL: "postgres://localhost/test",
		EMAIL_FROM: "Garbuix <codi@garbuix.app>",
		...overrides,
	};
}

const allProviders: Partial<Env> = {
	GOOGLE_CLIENT_ID: "google-id",
	GOOGLE_CLIENT_SECRET: "google-secret",
	APPLE_CLIENT_ID: "app.garbuix.web",
	APPLE_TEAM_ID: "TEAM123456",
	APPLE_KEY_ID: "KEY1234567",
	APPLE_PRIVATE_KEY: applePrivateKey,
	REDDIT_CLIENT_ID: "reddit-id",
	REDDIT_CLIENT_SECRET: "reddit-secret",
	RESEND_API_KEY: "re_test",
};

describe("buildAuthProviderConfig", () => {
	it("offers every method, in dialog order, once all are configured", () => {
		const config = buildAuthProviderConfig(env(allProviders), {
			isProduction: true,
		});

		expect(config.enabledMethods).toEqual([
			"google",
			"apple",
			"reddit",
			"email",
		]);
		expect(Object.keys(config.socialProviders)).toEqual([
			"google",
			"apple",
			"reddit",
		]);
	});

	it("leaves out a provider that is missing any credential", () => {
		const config = buildAuthProviderConfig(
			env({
				...allProviders,
				APPLE_KEY_ID: undefined,
				REDDIT_CLIENT_SECRET: undefined,
			}),
			{ isProduction: true },
		);

		expect(config.enabledMethods).toEqual(["google", "email"]);
		expect(config.socialProviders.apple).toBeUndefined();
		expect(config.socialProviders.reddit).toBeUndefined();
	});

	it("hides email codes in production without a mail provider", () => {
		const config = buildAuthProviderConfig(env(), { isProduction: true });

		expect(config.enabledMethods).toEqual([]);
		expect(config.signInCodeMailer).toBeNull();
	});

	it("logs email codes in development without a mail provider", () => {
		const config = buildAuthProviderConfig(env(), { isProduction: false });

		expect(config.enabledMethods).toEqual(["email"]);
		expect(config.signInCodeMailer).toBe(logSignInCode);
	});

	it("hands Better Auth a signed Apple client secret", () => {
		const config = buildAuthProviderConfig(env(allProviders), {
			isProduction: true,
		});
		const apple = config.socialProviders.apple as {
			clientId: string;
			clientSecret: string;
		};

		expect(apple.clientId).toBe("app.garbuix.web");
		expect(apple.clientSecret.split(".")).toHaveLength(3);
	});
});
