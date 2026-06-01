import {
	type ClueRequest,
	type ClueRequestStreamEvent,
	type ClueResponse,
	clueRequestsChannel,
	clueResponsesChannel,
	pendingRequestsKey,
} from "@/lib/clue-request-types";
import { getRedis, isRedisConfigured } from "@/lib/redis.server";

// Peer clue requests live entirely in Redis: a pending-requests hash per puzzle
// (seeds the SSE snapshot) plus pub/sub channels for live delivery. Mirrors the
// leaderboard's Redis usage; every function degrades to a no-op when Redis is
// not configured.

// How long a request stays answerable. Pruned lazily on read since Redis hashes
// have no per-field TTL. Long enough for another player to notice and reply.
const REQUEST_TTL_MS = 15 * 60 * 1000;
// Whole-hash expiry, refreshed on each write, so abandoned puzzles get cleaned up.
const HASH_TTL_SECONDS = 60 * 60;

type StoredRequest = {
	request: ClueRequest;
	expiresAt: number;
};

export type CreateClueRequestInput = {
	dateKey: string;
	puzzleId: string;
	wordId: number;
	wordLength: number;
	requesterId: string;
	requesterName: string;
};

export async function createClueRequest(
	input: CreateClueRequestInput,
): Promise<ClueRequest | null> {
	if (!isRedisConfigured()) {
		return null;
	}
	const redis = getRedis();
	if (!redis) {
		return null;
	}

	const now = Date.now();
	const request: ClueRequest = {
		id: crypto.randomUUID(),
		dateKey: input.dateKey,
		puzzleId: input.puzzleId,
		wordId: input.wordId,
		wordLength: input.wordLength,
		requesterId: input.requesterId,
		requesterName: input.requesterName,
		createdAt: new Date(now).toISOString(),
	};

	const stored: StoredRequest = { request, expiresAt: now + REQUEST_TTL_MS };
	const hashKey = pendingRequestsKey(input.dateKey);

	try {
		const pipeline = redis.pipeline();
		pipeline.hset(hashKey, request.id, JSON.stringify(stored));
		pipeline.expire(hashKey, HASH_TTL_SECONDS);
		await pipeline.exec();

		const event: ClueRequestStreamEvent = { type: "request", request };
		await redis.publish(
			clueRequestsChannel(input.dateKey),
			JSON.stringify(event),
		);
	} catch (error) {
		console.warn("[clue-request] failed to create request", error);
		return null;
	}

	return request;
}

// True when the requester already has an open (unexpired) request for the word,
// used to keep a single in-flight request per asker+word.
export async function hasActiveClueRequest(
	dateKey: string,
	requesterId: string,
	wordId: number,
): Promise<boolean> {
	const pending = await getPendingClueRequests(dateKey);
	return pending.some(
		(request) =>
			request.requesterId === requesterId && request.wordId === wordId,
	);
}

export async function getClueRequest(
	dateKey: string,
	requestId: string,
): Promise<ClueRequest | null> {
	if (!isRedisConfigured()) {
		return null;
	}
	const redis = getRedis();
	if (!redis) {
		return null;
	}

	try {
		const raw = await redis.hget(pendingRequestsKey(dateKey), requestId);
		if (!raw) {
			return null;
		}
		const stored = JSON.parse(raw) as StoredRequest;
		if (stored.expiresAt <= Date.now()) {
			await redis.hdel(pendingRequestsKey(dateKey), requestId);
			return null;
		}
		return stored.request;
	} catch (error) {
		console.warn("[clue-request] failed to load request", error);
		return null;
	}
}

export async function getPendingClueRequests(
	dateKey: string,
): Promise<ClueRequest[]> {
	if (!isRedisConfigured()) {
		return [];
	}
	const redis = getRedis();
	if (!redis) {
		return [];
	}

	const hashKey = pendingRequestsKey(dateKey);
	let entries: Record<string, string>;
	try {
		entries = await redis.hgetall(hashKey);
	} catch (error) {
		console.warn("[clue-request] failed to read pending requests", error);
		return [];
	}

	const now = Date.now();
	const expiredIds: string[] = [];
	const requests: ClueRequest[] = [];

	for (const [id, raw] of Object.entries(entries)) {
		try {
			const stored = JSON.parse(raw) as StoredRequest;
			if (stored.expiresAt <= now) {
				expiredIds.push(id);
				continue;
			}
			requests.push(stored.request);
		} catch {
			expiredIds.push(id);
		}
	}

	if (expiredIds.length > 0) {
		redis.hdel(hashKey, ...expiredIds).catch(() => {});
	}

	requests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return requests;
}

export async function publishClueResponse(options: {
	request: ClueRequest;
	text: string;
	responderName: string;
}): Promise<void> {
	if (!isRedisConfigured()) {
		return;
	}
	const redis = getRedis();
	if (!redis) {
		return;
	}

	const response: ClueResponse = {
		requestId: options.request.id,
		wordId: options.request.wordId,
		text: options.text.trim(),
		responderName: options.responderName,
		at: new Date().toISOString(),
	};
	const event: ClueRequestStreamEvent = { type: "response", response };

	try {
		await redis.publish(
			clueResponsesChannel(options.request.requesterId),
			JSON.stringify(event),
		);
	} catch (error) {
		console.warn("[clue-request] failed to publish response", error);
	}
}

// Removes a request from the pending set and tells every connected responder to
// drop it from their badge/list. Idempotent — broadcasts even if the entry was
// already gone, so late subscribers converge.
export async function resolveClueRequest(
	dateKey: string,
	request: Pick<ClueRequest, "id" | "wordId">,
): Promise<void> {
	if (!isRedisConfigured()) {
		return;
	}
	const redis = getRedis();
	if (!redis) {
		return;
	}

	const event: ClueRequestStreamEvent = {
		type: "resolved",
		requestId: request.id,
		wordId: request.wordId,
	};

	try {
		await redis.hdel(pendingRequestsKey(dateKey), request.id);
		await redis.publish(clueRequestsChannel(dateKey), JSON.stringify(event));
	} catch (error) {
		console.warn("[clue-request] failed to resolve request", error);
	}
}

// Resolves any of a requester's own pending requests for a word — used when the
// asker finds the word and no longer needs help.
export async function resolveOwnClueRequestsForWord(options: {
	dateKey: string;
	requesterId: string;
	wordId: number;
}): Promise<void> {
	const pending = await getPendingClueRequests(options.dateKey);
	const matches = pending.filter(
		(request) =>
			request.requesterId === options.requesterId &&
			request.wordId === options.wordId,
	);
	await Promise.all(
		matches.map((request) => resolveClueRequest(options.dateKey, request)),
	);
}
