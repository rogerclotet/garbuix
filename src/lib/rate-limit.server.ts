import { getRedis, isRedisConfigured } from "@/lib/redis.server";

// Fixed-window counters in Redis. Every write endpoint was previously unbounded,
// which let one caller flood the leaderboard with entries, spam clue responses
// into other players' games, or simply hammer the API.
//
// Degrades open when Redis isn't configured — the same way the leaderboard and
// clue features themselves no-op there, so there is nothing to abuse in that
// setup. A fixed window is coarse (a caller can spend two windows' budget across
// a boundary) but it costs one round trip and needs no cleanup, which suits
// limits set well above what a real player generates.

export type RateLimitResult = {
	allowed: boolean;
	retryAfterSeconds: number;
};

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

export async function consumeRateLimit(options: {
	// Identifies the bucket, e.g. "clue:respond:anon:abc123".
	key: string;
	limit: number;
	windowSeconds: number;
}): Promise<RateLimitResult> {
	if (!isRedisConfigured()) {
		return ALLOWED;
	}

	const redis = getRedis();
	if (!redis) {
		return ALLOWED;
	}

	const redisKey = `rl:${options.key}`;

	try {
		const pipeline = redis.pipeline();
		pipeline.incr(redisKey);
		// Only sets the TTL when the key has none, so the window starts at the
		// first request and isn't extended by later ones inside it.
		pipeline.expire(redisKey, options.windowSeconds, "NX");
		const results = (await pipeline.exec()) ?? [];
		const [incrError, rawCount] = results[0] ?? [null, null];

		if (incrError) {
			return ALLOWED;
		}

		const count = typeof rawCount === "number" ? rawCount : Number(rawCount);
		if (!Number.isFinite(count) || count <= options.limit) {
			return ALLOWED;
		}

		const ttl = await redis.ttl(redisKey);
		return {
			allowed: false,
			retryAfterSeconds: ttl > 0 ? ttl : options.windowSeconds,
		};
	} catch (error) {
		// A limiter that fails closed would take the game down with Redis.
		console.warn("[rate-limit] check failed", error);
		return ALLOWED;
	}
}

export function tooManyRequests(result: RateLimitResult): Response {
	return new Response("Too Many Requests", {
		status: 429,
		headers: { "Retry-After": String(result.retryAfterSeconds) },
	});
}

// The caller's address, for limits that must survive someone discarding their
// guest cookie to get a fresh bucket. Both headers are set by the proxy in
// front of the app; direct connections fall back to a shared bucket.
export function getClientAddress(request: Request): string {
	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) {
		const first = forwardedFor.split(",")[0]?.trim();
		if (first) {
			return first;
		}
	}

	return request.headers.get("x-real-ip")?.trim() || "unknown";
}
