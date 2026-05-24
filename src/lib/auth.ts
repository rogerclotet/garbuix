import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { authSchema } from "@/db/schema";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/server-env";

const serverEnv = getServerEnv();

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
	baseURL: {
		allowedHosts: ["garbuix.app", "garbuix.clotet.dev"],
		protocol: "https",
		fallback: "https://garbuix.app",
	},
	secret: serverEnv.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: authSchema,
	}),
	socialProviders,
	plugins: [tanstackStartCookies()],
});
