import {
	type ClueHelpGiven,
	type ClueRequest,
	type ClueRequestStreamEvent,
	type ClueResponse,
	clueHelpGivenField,
	clueHelpGivenKey,
	clueInboxKey,
	clueRequestRecordsKey,
	clueRequestsChannel,
	clueResponsesChannel,
	pendingRequestsKey,
} from "@/lib/clue-request-types";
import { getRedis, isRedisConfigured } from "@/lib/redis.server";

// Peer clue requests live entirely in Redis: a pending-requests hash per puzzle
// (seeds the SSE snapshot) plus pub/sub channels for live delivery. Mirrors the
// leaderboard's Redis usage; every function degrades to a no-op when Redis is
// not configured.

// How long a request is advertised to responders (shown as an "Ajuda" button and
// in the snapshot). Pruned lazily on read since Redis hashes have no per-field
// TTL. Generous because the player base is small — there isn't always someone
// playing within a few minutes, so a request needs to stay visible long enough
// for another player to come along and notice it.
const REQUEST_TTL_MS = 3 * 60 * 60 * 1000;
// Whole-hash expiry, refreshed on each write, so abandoned puzzles get cleaned
// up. Must cover the advertise window, otherwise the hash could evict a request
// that should still be shown before it expires on its own.
const HASH_TTL_SECONDS = REQUEST_TTL_MS / 1000;
// How long a delivered clue stays in the asker's inbox (covers a full session),
// and — matching it — how long a request stays deliverable via its durable
// record. Delivery must outlive the short advertise TTL so a clue sent after the
// asker goes offline still lands in their inbox for the next time they connect.
const INBOX_TTL_SECONDS = 24 * 60 * 60;
const RECORD_TTL_SECONDS = INBOX_TTL_SECONDS;

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
	requesterHasAiClue: boolean;
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
		requesterHasAiClue: input.requesterHasAiClue,
	};

	const stored: StoredRequest = { request, expiresAt: now + REQUEST_TTL_MS };
	const hashKey = pendingRequestsKey(input.dateKey);
	const recordsKey = clueRequestRecordsKey(input.dateKey);

	try {
		const pipeline = redis.pipeline();
		// Pending entry drives the short-lived advertise window; the records entry
		// keeps the request deliverable for the full inbox window (see getClueRequest).
		pipeline.hset(hashKey, request.id, JSON.stringify(stored));
		pipeline.expire(hashKey, HASH_TTL_SECONDS);
		pipeline.hset(recordsKey, request.id, JSON.stringify(request));
		pipeline.expire(recordsKey, RECORD_TTL_SECONDS);
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

// Loads a request for the purpose of answering it. Reads the durable records
// hash, not the pending hash, so a clue can be delivered for the full inbox
// window even after the advertise TTL pruned the pending entry — the asker may be
// offline and only see it on their next connect. Returns null only when the
// request is genuinely gone (resolved, or older than the 24h record TTL), in
// which case the caller treats the send as a silent success. Falls back to the
// pending hash for requests created before durable records existed (deploy gap).
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
		const record = await redis.hget(clueRequestRecordsKey(dateKey), requestId);
		if (record) {
			return JSON.parse(record) as ClueRequest;
		}
		const pending = await redis.hget(pendingRequestsKey(dateKey), requestId);
		if (!pending) {
			return null;
		}
		return (JSON.parse(pending) as StoredRequest).request;
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

export async function hasHelpedRequesterForWord(options: {
	responderId: string;
	dateKey: string;
	requesterId: string;
	wordId: number;
}): Promise<boolean> {
	if (!isRedisConfigured()) {
		return false;
	}
	const redis = getRedis();
	if (!redis) {
		return false;
	}

	try {
		const field = clueHelpGivenField(options.requesterId, options.wordId);
		const record = await redis.hget(
			clueHelpGivenKey(options.responderId, options.dateKey),
			field,
		);
		return record != null;
	} catch (error) {
		console.warn("[clue-request] failed to read help-given record", error);
		return false;
	}
}

export async function getHelpGivenRecords(
	responderId: string,
	dateKey: string,
): Promise<ClueHelpGiven[]> {
	if (!isRedisConfigured()) {
		return [];
	}
	const redis = getRedis();
	if (!redis) {
		return [];
	}

	try {
		const entries = await redis.hgetall(clueHelpGivenKey(responderId, dateKey));
		return Object.values(entries)
			.map((raw) => {
				try {
					return JSON.parse(raw) as ClueHelpGiven;
				} catch {
					return null;
				}
			})
			.filter((record): record is ClueHelpGiven => record !== null);
	} catch (error) {
		console.warn("[clue-request] failed to read help-given records", error);
		return [];
	}
}

export async function publishClueResponse(options: {
	request: ClueRequest;
	text: string;
	responderName: string;
	responderId: string;
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
	const inboxKey = clueInboxKey(
		options.request.requesterId,
		options.request.dateKey,
	);
	const helpKey = clueHelpGivenKey(
		options.responderId,
		options.request.dateKey,
	);
	const helpField = clueHelpGivenField(
		options.request.requesterId,
		options.request.wordId,
	);
	const helpRecord: ClueHelpGiven = {
		requesterId: options.request.requesterId,
		wordId: options.request.wordId,
		requesterName: options.request.requesterName,
		at: new Date().toISOString(),
	};

	try {
		// Persist first so the clue survives even if the live event is missed (SSE
		// reconnect); the asker's snapshot replays the inbox on connect.
		const pipeline = redis.pipeline();
		pipeline.hset(inboxKey, String(response.wordId), JSON.stringify(response));
		pipeline.expire(inboxKey, INBOX_TTL_SECONDS);
		pipeline.hset(helpKey, helpField, JSON.stringify(helpRecord));
		pipeline.expire(helpKey, INBOX_TTL_SECONDS);
		await pipeline.exec();

		await redis.publish(
			clueResponsesChannel(
				options.request.requesterId,
				options.request.dateKey,
			),
			JSON.stringify(event),
		);
	} catch (error) {
		console.warn("[clue-request] failed to publish response", error);
	}
}

// Clues already delivered to a user for a puzzle, replayed in the SSE snapshot so
// they show under the word regardless of whether the live event was received.
export async function getClueInbox(
	userId: string,
	dateKey: string,
): Promise<ClueResponse[]> {
	if (!isRedisConfigured()) {
		return [];
	}
	const redis = getRedis();
	if (!redis) {
		return [];
	}

	try {
		const entries = await redis.hgetall(clueInboxKey(userId, dateKey));
		return Object.values(entries)
			.map((raw) => {
				try {
					return JSON.parse(raw) as ClueResponse;
				} catch {
					return null;
				}
			})
			.filter((response): response is ClueResponse => response !== null);
	} catch (error) {
		console.warn("[clue-request] failed to read inbox", error);
		return [];
	}
}

// Removes a request from both the pending set (stops advertising it) and the
// durable records (stops further delivery, so "asker found it" actually closes
// the request), and tells every connected responder to drop it from their
// badge/list. Multiple players can each answer the same request — this is only
// called when the asker themselves no longer needs help. Idempotent — broadcasts
// even if the entry was already gone, so late subscribers converge.
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
		await redis.hdel(clueRequestRecordsKey(dateKey), request.id);
		await redis.publish(clueRequestsChannel(dateKey), JSON.stringify(event));
	} catch (error) {
		console.warn("[clue-request] failed to resolve request", error);
	}
}

// Durable records for a puzzle (the full deliverable set, including requests past
// their advertise window). Used to close out a request from the asker's side.
async function getClueRequestRecords(dateKey: string): Promise<ClueRequest[]> {
	if (!isRedisConfigured()) {
		return [];
	}
	const redis = getRedis();
	if (!redis) {
		return [];
	}

	try {
		const entries = await redis.hgetall(clueRequestRecordsKey(dateKey));
		return Object.values(entries)
			.map((raw) => {
				try {
					return JSON.parse(raw) as ClueRequest;
				} catch {
					return null;
				}
			})
			.filter((request): request is ClueRequest => request !== null);
	} catch (error) {
		console.warn("[clue-request] failed to read records", error);
		return [];
	}
}

// Resolves any of a requester's own requests for a word — used when the asker
// finds the word and no longer needs help. Reads the durable records (not just
// the advertised pending set) so a request still closes even after its advertise
// window lapsed, stopping a late responder's clue from landing for a found word.
export async function resolveOwnClueRequestsForWord(options: {
	dateKey: string;
	requesterId: string;
	wordId: number;
}): Promise<void> {
	const records = await getClueRequestRecords(options.dateKey);
	const matches = records.filter(
		(request) =>
			request.requesterId === options.requesterId &&
			request.wordId === options.wordId,
	);
	await Promise.all(
		matches.map((request) => resolveClueRequest(options.dateKey, request)),
	);
}
