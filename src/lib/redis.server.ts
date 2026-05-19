import { Redis, type RedisOptions } from "ioredis";
import { getServerEnv } from "@/lib/server-env";

let cachedPublisher: Redis | null = null;
let cachedSubscriber: Redis | null = null;

function buildClient(role: "publisher" | "subscriber"): Redis | null {
	const url = getServerEnv().REDIS_URL;
	if (!url) {
		return null;
	}

	const options: RedisOptions = {
		lazyConnect: false,
		maxRetriesPerRequest: 3,
		enableOfflineQueue: role === "publisher",
		connectionName: `paraules-${role}`,
	};

	const client = new Redis(url, options);
	client.on("error", (error) => {
		console.warn(`[redis:${role}] error`, error.message);
	});
	return client;
}

export function getRedis(): Redis | null {
	if (cachedPublisher) {
		return cachedPublisher;
	}
	cachedPublisher = buildClient("publisher");
	return cachedPublisher;
}

export function getRedisSub(): Redis | null {
	if (cachedSubscriber) {
		return cachedSubscriber;
	}
	cachedSubscriber = buildClient("subscriber");
	return cachedSubscriber;
}

export function isRedisConfigured(): boolean {
	return Boolean(getServerEnv().REDIS_URL);
}
