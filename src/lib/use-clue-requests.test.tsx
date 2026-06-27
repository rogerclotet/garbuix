// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClueRequestStreamEvent } from "@/lib/clue-request-types";
import { ClueRequestsProvider, useClueRequests } from "./use-clue-requests";

const DATE_KEY = "2026-06-11";
const USER_ID = "user-1";

// Minimal EventSource stand-in (jsdom has none): records instances so tests can
// push snapshot/message events through the provider's real handlers.
class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	onerror: (() => void) | null = null;
	onopen: (() => void) | null = null;
	private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(
		type: string,
		listener: (event: MessageEvent) => void,
	): void {
		const set = this.listeners.get(type) ?? new Set();
		set.add(listener);
		this.listeners.set(type, set);
	}

	removeEventListener(
		type: string,
		listener: (event: MessageEvent) => void,
	): void {
		this.listeners.get(type)?.delete(listener);
	}

	close(): void {}

	emit(type: string, data: unknown): void {
		const event = { data: JSON.stringify(data) } as MessageEvent;
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event);
		}
	}
}

// The environment's localStorage is non-functional under vitest (Node's
// --localstorage-file shim); the provider tolerates that, but the tests need a
// real store to simulate the notified-set surviving a reload.
function createMemoryStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (key: string) => store.get(key) ?? null,
		key: (index: number) => [...store.keys()][index] ?? null,
		removeItem: (key: string) => {
			store.delete(key);
		},
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
	};
}

type ClueRequestsContext = ReturnType<typeof useClueRequests>;

let captured: ClueRequestsContext | null = null;

function Probe() {
	captured = useClueRequests();
	return null;
}

function context(): ClueRequestsContext {
	if (!captured) {
		throw new Error("context not captured");
	}
	return captured;
}

function renderProvider() {
	return render(
		<ClueRequestsProvider dateKey={DATE_KEY} localUserId={USER_ID}>
			<Probe />
		</ClueRequestsProvider>,
	);
}

function lastEventSource(): MockEventSource {
	const source = MockEventSource.instances.at(-1);
	if (!source) {
		throw new Error("no EventSource was opened");
	}
	return source;
}

describe("ClueRequestsProvider snapshot replay", () => {
	beforeEach(() => {
		MockEventSource.instances = [];
		captured = null;
		vi.stubGlobal("localStorage", createMemoryStorage());
		vi.stubGlobal("EventSource", MockEventSource);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({}),
			})),
		);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("renders replayed clues that were already notified in a previous session", () => {
		// Simulate a prior session: the clue was toasted, then the page reloaded.
		window.localStorage.setItem(
			`clue-notified:${USER_ID}:${DATE_KEY}`,
			JSON.stringify(["3:2026-06-11T08:00:00.000Z"]),
		);
		renderProvider();

		const events: ClueRequestStreamEvent[] = [];
		act(() => {
			context().subscribe((event) => events.push(event));
		});
		act(() => {
			lastEventSource().emit("snapshot", {
				dateKey: DATE_KEY,
				requests: [],
				responses: [
					{
						requestId: "req-1",
						wordId: 3,
						text: "El que tens al teu voltant",
						responderName: "Anna",
						at: "2026-06-11T08:00:00.000Z",
					},
				],
			});
		});

		// The clue must render again after the reload...
		expect(context().receivedClues[3]?.text).toBe("El que tens al teu voltant");
		// ...without re-notifying (no duplicate toast).
		expect(events).toHaveLength(0);
	});

	it("restores own pending help requests from the snapshot", () => {
		renderProvider();

		act(() => {
			lastEventSource().emit("snapshot", {
				dateKey: DATE_KEY,
				requests: [],
				ownRequests: [
					{
						id: "req-2",
						dateKey: DATE_KEY,
						puzzleId: "puzzle-1",
						wordId: 5,
						wordLength: 4,
						requesterId: USER_ID,
						requesterName: "Jo",
						createdAt: "2026-06-11T08:00:00.000Z",
					},
				],
				responses: [],
			});
		});

		expect(context().requestedHelpWordIds).toContain(5);
	});

	it("keeps the waiting state when the server reports a duplicate request", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ created: false, reason: "duplicate" }),
			})),
		);
		renderProvider();

		let result = false;
		await act(async () => {
			result = await context().requestClue(7);
		});

		expect(result).toBe(true);
		expect(context().requestedHelpWordIds).toContain(7);
	});

	it("recovers a request whose live event was missed via the inbox poll", async () => {
		const request = {
			id: "req-9",
			dateKey: DATE_KEY,
			puzzleId: "puzzle-1",
			wordId: 2,
			wordLength: 4,
			requesterId: "user-2",
			requesterName: "Bru",
			createdAt: "2026-06-11T08:00:00.000Z",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ requests: [request], responses: [] }),
			})),
		);
		vi.useFakeTimers();
		renderProvider();
		// The responder has found this word, so the recovered request is actionable.
		act(() => {
			context().publishSolvedWordIds([2]);
		});

		// No live "request" event arrives; the 8s inbox poll must surface it anyway.
		expect(context().incomingRequests).toHaveLength(0);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(8000);
		});

		expect(context().incomingRequests.map((r) => r.id)).toContain("req-9");
	});

	it("drops a resolved request whose live event was missed via the inbox poll", async () => {
		const request = {
			id: "req-9",
			dateKey: DATE_KEY,
			puzzleId: "puzzle-1",
			wordId: 2,
			wordLength: 4,
			requesterId: "user-2",
			requesterName: "Bru",
			createdAt: "2026-06-11T08:00:00.000Z",
		};
		// First poll surfaces the request, second poll no longer lists it (resolved).
		let polls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				polls += 1;
				return {
					ok: true,
					json: async () => ({
						requests: polls === 1 ? [request] : [],
						responses: [],
					}),
				};
			}),
		);
		vi.useFakeTimers();
		renderProvider();
		act(() => {
			context().publishSolvedWordIds([2]);
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(8000);
		});
		expect(context().incomingRequests.map((r) => r.id)).toContain("req-9");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(8000);
		});
		expect(context().incomingRequests).toHaveLength(0);
	});

	it("rolls back the waiting state when the request fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				json: async () => ({}),
			})),
		);
		renderProvider();

		let result = true;
		await act(async () => {
			result = await context().requestClue(7);
		});

		expect(result).toBe(false);
		expect(context().requestedHelpWordIds).not.toContain(7);
	});
});
