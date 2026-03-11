import { defineConfig } from "drizzle-kit";
import { getServerEnv } from "./src/lib/server-env";

export default defineConfig({
	out: "./drizzle",
	schema: ["./src/db/auth-schema.ts", "./src/db/schema.ts"],
	dialect: "postgresql",
	dbCredentials: {
		url: getServerEnv().DATABASE_URL,
	},
});
