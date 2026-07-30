import { beforeEach, describe, expect, it, vi } from "vitest";
import { clueInboxKey, pendingRequestsKey } from "@/lib/clue-request-types";

// A minimal in-memory stand-in for the Redis client: hash commands plus a
// chainable pipeline, enough to exercise the clue-request store/load paths.
class FakeRedis {
	store = new Map<string, Map<string, string>>();
	published: Array<{ channel: string; message: string }> = [];

	private hash(key: string): Map<string, string> {
		let h = this.store.get(key);
		if (!h) {
			h = new Map();
			this.store.set(key, h);
		}
		return h;
	}

	async hget(key: string, field: string): Promise<string | null> {
		return this.store.get(key)?.get(field) ?? null;
	}

	async hgetall(key: string): Promise<Record<string, string>> {
		const h = this.store.get(key);
		return h ? Object.fromEntries(h) : {};
	}

	async hdel(key: string, ...fields: string[]): Promise<number> {
		const h = this.store.get(key);
		if (!h) return 0;
		let removed = 0;
		for (const field of fields) {
			if (h.delete(field)) removed += 1;
		}
		return removed;
	}

	async publish(channel: string, message: string): Promise<number> {
		this.published.push({ channel, message });
		return 0;
	}

	pipeline() {
		const ops: Array<() => void> = [];
		const chain = {
			hset: (key: string, field: string, value: string) => {
				ops.push(() => this.hash(key).set(field, value));
				return chain;
			},
			expire: () => chain,
			exec: async () => {
				for (const op of ops) op();
				return [];
			},
		};
		return chain;
	}
}

const { redisRef } = vi.hoisted(() => ({
	redisRef: { current: null as FakeRedis | null },
}));

vi.mock("@/lib/redis.server", () => ({
	isRedisConfigured: () => true,
	getRedis: () => redisRef.current,
	getRedisSub: () => redisRef.current,
}));

import {
	createClueRequest,
	getClueInbox,
	getClueRequest,
	publishClueResponse,
	resolveClueRequest,
	resolveOwnClueRequestsForWord,
} from "@/lib/clue-request.server";

const DATE_KEY = "2026-06-27";

function createInput() {
	return {
		dateKey: DATE_KEY,
		puzzleId: "puzzle-1",
		wordId: 3,
		wordLength: 5,
		requesterId: "asker-1",
		requesterName: "Anna",
	};
}

// Simulates the advertise window lapsing: a poll/snapshot prunes the expired
// pending entry. Delivery must not depend on the pending entry surviving.
function dropPendingEntry(requestId: string) {
	redisRef.current?.store.get(pendingRequestsKey(DATE_KEY))?.delete(requestId);
}

describe("clue request store-and-forward", () => {
	beforeEach(() => {
		redisRef.current = new FakeRedis();
	});

	it("delivers a clue to the asker's inbox after the request stops being advertised", async () => {
		const request = await createClueRequest(createInput());
		expect(request).not.toBeNull();
		if (!request) return;

		// The asker goes offline and their request ages out of the advertised set.
		dropPendingEntry(request.id);

		// A responder answering now must still resolve the request (from the durable
		// record) and land the clue in the asker's inbox for their next connect.
		const loaded = await getClueRequest(DATE_KEY, request.id);
		expect(loaded?.id).toBe(request.id);
		if (!loaded) return;

		await publishClueResponse({
			request: loaded,
			text: "Una peça de roba",
			responderName: "Bru",
		});

		const inbox = await getClueInbox(request.requesterId, DATE_KEY);
		expect(inbox).toHaveLength(1);
		expect(inbox[0]?.wordId).toBe(request.wordId);
		expect(inbox[0]?.text).toBe("Una peça de roba");
		expect(inbox[0]?.responderName).toBe("Bru");
	});

	it("stops delivering once the request is resolved (first-responder-wins)", async () => {
		const request = await createClueRequest(createInput());
		expect(request).not.toBeNull();
		if (!request) return;

		await resolveClueRequest(DATE_KEY, request);

		// A second responder finds nothing to answer — the send is a silent no-op.
		expect(await getClueRequest(DATE_KEY, request.id)).toBeNull();
	});

	it("closes the request when the asker finds the word, even past the advertise window", async () => {
		const request = await createClueRequest(createInput());
		expect(request).not.toBeNull();
		if (!request) return;

		dropPendingEntry(request.id);

		await resolveOwnClueRequestsForWord({
			dateKey: DATE_KEY,
			requesterId: request.requesterId,
			wordId: request.wordId,
		});

		// The durable record is gone, so a late clue won't land for a found word.
		expect(await getClueRequest(DATE_KEY, request.id)).toBeNull();
		expect(
			redisRef.current?.store.get(clueInboxKey(request.requesterId, DATE_KEY)),
		).toBeUndefined();
	});
});
