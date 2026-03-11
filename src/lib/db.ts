import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { getServerEnv } from "@/lib/server-env";

const connectionString = getServerEnv().DATABASE_URL;

export const sql = postgres(connectionString, {
	idle_timeout: 20,
	max: 1,
	prepare: false,
});

export const db = drizzle(sql, { schema });
