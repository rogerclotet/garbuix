import { Redis } from "ioredis";
import postgres from "postgres";
import { getServerEnv } from "@/lib/server-env";

const TIMEOUT_MS = 2_000;
let pendingCheck: Promise<boolean> | undefined;

async function checkDependencies(): Promise<boolean> {
	const env = getServerEnv();
	// Dedicated probe connections can be closed on timeout without cancelling
	// application queries. Concurrent probes share this bounded check.
	const sql = postgres(env.DATABASE_URL, {
		max: 1,
		prepare: false,
		connect_timeout: TIMEOUT_MS / 1_000,
	});
	let redis: Redis | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		if (env.REDIS_URL) {
			redis = new Redis(env.REDIS_URL, {
				lazyConnect: true,
				connectTimeout: TIMEOUT_MS,
				commandTimeout: TIMEOUT_MS,
				retryStrategy: () => null,
				enableOfflineQueue: false,
			});
			// A failed probe is represented by HTTP 503. Application clients still
			// report their connection failures through the usual GlitchTip path.
			redis.on("error", () => {});
		}
		const redisClient = redis;
		const redisCheck = redisClient
			? redisClient.connect().then(() => redisClient.ping())
			: Promise.resolve();
		return await Promise.race([
			Promise.all([sql`SELECT 1`, redisCheck]).then(() => true),
			new Promise<false>((resolve) => {
				timer = setTimeout(() => resolve(false), TIMEOUT_MS);
			}),
		]);
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
		redis?.disconnect();
		await sql.end({ timeout: 0 });
	}
}

export async function getReadinessResponse(): Promise<Response> {
	pendingCheck ??= checkDependencies().finally(() => {
		pendingCheck = undefined;
	});
	const ready = await pendingCheck;
	return Response.json(
		{ status: ready ? "ok" : "unavailable" },
		{ status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
	);
}
