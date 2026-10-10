import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { authSchema } from "@/db/schema";
import { buildAuthProviderConfig } from "@/lib/auth-providers.server";
import { db } from "@/lib/db";
import { resolveNewUserProfile } from "@/lib/new-user-profile";
import { getServerEnv } from "@/lib/server-env";
import { SIGN_IN_CODE_TTL_MINUTES } from "@/lib/sign-in-email.server";

const serverEnv = getServerEnv();

const isProduction = process.env.NODE_ENV === "production";

// In development the app is served over plain HTTP on localhost, which the
// production allowedHosts/HTTPS base URL rejects as an invalid origin. Trust the
// local dev origin (override with BETTER_AUTH_URL when not on :3000) so login
// works locally; production keeps the strict host allowlist.
const devBaseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

const { socialProviders, signInCodeMailer, enabledMethods } =
	buildAuthProviderConfig(serverEnv, { isProduction });

export const enabledSignInMethods = enabledMethods;

// Better Auth also accepts an environment opt-in, which overrides its options.
process.env.BETTER_AUTH_TELEMETRY = "false";

export const auth = betterAuth({
	telemetry: { enabled: false },
	basePath: "/api/auth",
	baseURL: isProduction
		? {
				allowedHosts: ["garbuix.app", "garbuix.clotet.dev"],
				protocol: "https",
				fallback: "https://garbuix.app",
			}
		: devBaseURL,
	trustedOrigins: isProduction ? [] : [devBaseURL],
	secret: serverEnv.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: authSchema,
	}),
	socialProviders,
	account: {
		// One player, one account: an emailed code for an address a Google
		// account already verified signs in to that account, and the other way
		// round.
		accountLinking: { enabled: true },
	},
	databaseHooks: {
		user: {
			create: {
				before: async (newUser, ctx) => {
					const profile = resolveNewUserProfile({
						name: newUser.name,
						image: newUser.image,
						path: ctx?.path,
					});
					return { data: { ...newUser, ...profile } };
				},
			},
		},
	},
	plugins: [
		...(signInCodeMailer
			? [
					emailOTP({
						expiresIn: SIGN_IN_CODE_TTL_MINUTES * 60,
						// Codes are only for signing in: the app has no passwords to
						// reset and no unverified emails to confirm.
						sendVerificationOTP: async ({ email, otp, type }) => {
							if (type !== "sign-in") return;
							await signInCodeMailer(email, otp);
						},
					}),
				]
			: []),
		tanstackStartCookies(),
	],
});
