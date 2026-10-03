import { captureException } from "@sentry/tanstackstart-react";
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
		// INFO is invalid if SUBSCRIBE races with the connection readiness check.
		enableReadyCheck: role === "publisher",
		connectionName: `paraules-${role}`,
	};

	const client = new Redis(url, options);
	let reportedOutage = false;
	client.on("ready", () => {
		reportedOutage = false;
	});
	client.on("error", (error) => {
		// ioredis retries indefinitely. Report once until the connection recovers.
		if (!reportedOutage) {
			captureException(error);
			reportedOutage = true;
		}
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
