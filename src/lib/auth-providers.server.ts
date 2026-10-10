import type { BetterAuthOptions } from "better-auth";
import type { getServerEnv } from "@/lib/server-env";
import {
	createResendMailer,
	logSignInCode,
	type SignInCodeMailer,
} from "@/lib/sign-in-email.server";
import type { SignInMethod } from "@/lib/sign-in-methods";

type ServerEnv = ReturnType<typeof getServerEnv>;

type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

export type AuthProviderConfig = {
	socialProviders: SocialProviders;
	// Null when there is no way to deliver a code, which hides the email option.
	signInCodeMailer: SignInCodeMailer | null;
	enabledMethods: SignInMethod[];
};

// Each method turns on only once its credentials are set, so a half-configured
// one never shows a button that fails on click.
export function buildAuthProviderConfig(
	env: ServerEnv,
	options: { isProduction: boolean },
): AuthProviderConfig {
	const socialProviders: SocialProviders = {};
	const enabledMethods: SignInMethod[] = [];

	if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
		socialProviders.google = {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		};
		enabledMethods.push("google");
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
	if (signInCodeMailer) {
		enabledMethods.push("email");
	}

	return { socialProviders, signInCodeMailer, enabledMethods };
}
