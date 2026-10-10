import type { BetterAuthOptions } from "better-auth";
import { createAppleClientSecretSource } from "@/lib/apple-client-secret.server";
import type { getServerEnv } from "@/lib/server-env";
import {
	createResendMailer,
	logSignInCode,
	type SignInCodeMailer,
} from "@/lib/sign-in-email.server";
import { SIGN_IN_METHODS, type SignInMethod } from "@/lib/sign-in-methods";

type ServerEnv = ReturnType<typeof getServerEnv>;

type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

export type AuthProviderConfig = {
	socialProviders: SocialProviders;
	// Null when there is no way to deliver a code, which hides the email option.
	signInCodeMailer: SignInCodeMailer | null;
	enabledMethods: SignInMethod[];
};

// Each provider turns on only once all of its credentials are set, so a
// half-configured provider never shows a button that fails on click.
export function buildAuthProviderConfig(
	env: ServerEnv,
	options: { isProduction: boolean },
): AuthProviderConfig {
	const socialProviders: SocialProviders = {};

	if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
		socialProviders.google = {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		};
	}

	if (
		env.APPLE_CLIENT_ID &&
		env.APPLE_TEAM_ID &&
		env.APPLE_KEY_ID &&
		env.APPLE_PRIVATE_KEY
	) {
		const clientSecret = createAppleClientSecretSource({
			clientId: env.APPLE_CLIENT_ID,
			teamId: env.APPLE_TEAM_ID,
			keyId: env.APPLE_KEY_ID,
			privateKey: env.APPLE_PRIVATE_KEY,
		});
		const apple = { clientId: env.APPLE_CLIENT_ID } as {
			clientId: string;
			clientSecret: string;
		};
		Object.defineProperty(apple, "clientSecret", {
			enumerable: true,
			get: clientSecret,
		});
		socialProviders.apple = apple;
	}

	if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) {
		socialProviders.reddit = {
			clientId: env.REDDIT_CLIENT_ID,
			clientSecret: env.REDDIT_CLIENT_SECRET,
		};
	}

	let signInCodeMailer: SignInCodeMailer | null = null;
	if (env.RESEND_API_KEY) {
		signInCodeMailer = createResendMailer({
			apiKey: env.RESEND_API_KEY,
			from: env.EMAIL_FROM,
		});
	} else if (!options.isProduction) {
		signInCodeMailer = logSignInCode;
	}

	const enabledMethods = SIGN_IN_METHODS.filter((method) =>
		method === "email"
			? signInCodeMailer !== null
			: socialProviders[method] !== undefined,
	);

	return { socialProviders, signInCodeMailer, enabledMethods };
}
