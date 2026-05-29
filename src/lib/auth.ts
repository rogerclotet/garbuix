import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { authSchema } from "@/db/schema";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/server-env";

const serverEnv = getServerEnv();

const isProduction = process.env.NODE_ENV === "production";

// In development the app is served over plain HTTP on localhost, which the
// production allowedHosts/HTTPS base URL rejects as an invalid origin. Trust the
// local dev origin (override with BETTER_AUTH_URL when not on :3000) so login
// works locally; production keeps the strict host allowlist.
const devBaseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

const socialProviders =
	serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
		? {
				google: {
					clientId: serverEnv.GOOGLE_CLIENT_ID,
					clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
				},
			}
		: {};

export const auth = betterAuth({
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
	plugins: [tanstackStartCookies()],
});
