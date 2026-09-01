import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { getServerEnv } from "@/lib/server-env";

const connectionString = getServerEnv().DATABASE_URL;

const poolMax = Number(process.env.DB_POOL_MAX ?? 10);

export const sql = postgres(connectionString, {
	idle_timeout: 20,
	max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
	prepare: false,
});

export const db = drizzle(sql, { schema });
