import type { EventMessage } from "posthog-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Redis SET ... EX ... NX and GET, enough for the day key and the dedupe markers.
class FakeStore {
	values = new Map<string, string>();

	async set(
		key: string,
		value: string,
		_expiryMode: "EX",
		_seconds: number,
		_setMode: "NX",
	): Promise<"OK" | null> {
		if (this.values.has(key)) return null;
		this.values.set(key, value);
		return "OK";
	}

	async get(key: string): Promise<string | null> {
		return this.values.get(key) ?? null;
	}
}

const { captured, backgroundTasks, storeRef } = vi.hoisted(() => ({
	captured: [] as EventMessage[],
	backgroundTasks: [] as Promise<unknown>[],
	storeRef: { current: null as FakeStore | null },
}));

vi.mock("posthog-node", () => ({
	PostHog: class {
		capture(message: EventMessage) {
			captured.push(message);
		}
		async shutdown() {}
	},
}));

vi.mock("@/lib/redis.server", () => ({
	getRedis: () => storeRef.current,
}));

vi.mock("@/lib/shutdown.server", () => ({
	trackBackgroundTask: (task: Promise<unknown>) => {
		backgroundTasks.push(task);
	},
	registerResourceCloser: () => {},
}));

vi.mock("@/lib/server-env", () => ({
	getServerEnv: () => ({
		POSTHOG_PROJECT_KEY: "phc_test",
		POSTHOG_HOST: "https://eu.i.posthog.com",
	}),
}));

import {
	buildUsageEvent,
	dailyPlayerId,
	isCountableDateKey,
	type PuzzleUsage,
	recordPuzzleUsage,
	sendPuzzleUsage,
	usageEventsFor,
} from "@/lib/usage-stats.server";

const TODAY = "2026-10-24";
// Noon in Madrid, well clear of the date rollover.
const NOW = new Date("2026-10-24T10:00:00.000Z");

function usage(overrides: Partial<PuzzleUsage> = {}): PuzzleUsage {
	return {
		game: "mini",
		dateKey: TODAY,
		player: { kind: "guest", id: "device-1" },
		started: true,
		completed: false,
		...overrides,
	};
}

async function send(
	store: FakeStore,
	overrides: Partial<PuzzleUsage> = {},
): Promise<EventMessage[]> {
	const messages: EventMessage[] = [];
	await sendPuzzleUsage(usage(overrides), {
		store,
		capture: (message) => messages.push(message),
	});
	return messages;
}

describe("isCountableDateKey", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("takes today and yesterday only", () => {
		expect(isCountableDateKey(TODAY)).toBe(true);
		expect(isCountableDateKey("2026-10-23")).toBe(true);
		expect(isCountableDateKey("2026-10-22")).toBe(false);
		expect(isCountableDateKey("2026-10-25")).toBe(false);
	});
});

describe("usageEventsFor", () => {
	it("sends nothing before the first guess", () => {
		expect(usageEventsFor({ started: false, completed: false })).toEqual([]);
	});

	it("counts a finish as a start too", () => {
		expect(usageEventsFor({ started: false, completed: true })).toEqual([
			"puzzle_started",
			"puzzle_completed",
		]);
	});
});

describe("dailyPlayerId", () => {
	it("is stable within a day and unrelated across days", () => {
		const player = { kind: "user", id: "user-1" } as const;
		expect(dailyPlayerId("key-a", player)).toBe(dailyPlayerId("key-a", player));
		expect(dailyPlayerId("key-a", player)).not.toBe(
			dailyPlayerId("key-b", player),
		);
	});

	it("keeps an account and a guest with the same id apart", () => {
		expect(dailyPlayerId("key", { kind: "user", id: "same" })).not.toBe(
			dailyPlayerId("key", { kind: "guest", id: "same" }),
		);
	});
});

describe("buildUsageEvent", () => {
	it("sends the game, the date and the derived id, and nothing else", () => {
		expect(
			buildUsageEvent("puzzle_completed", "derived-id", {
				game: "quadrat",
				dateKey: TODAY,
			}),
		).toEqual({
			distinctId: "derived-id",
			event: "puzzle_completed",
			properties: {
				game: "quadrat",
				puzzle_date: TODAY,
				$process_person_profile: false,
			},
			disableGeoip: true,
		});
	});
});

describe("sendPuzzleUsage", () => {
	it("sends each event once per player, game and day", async () => {
		const store = new FakeStore();

		const first = await send(store);
		const repeat = await send(store);
		const finish = await send(store, { completed: true });
		const finishAgain = await send(store, { completed: true });

		expect(first.map((message) => message.event)).toEqual(["puzzle_started"]);
		expect(repeat).toEqual([]);
		expect(finish.map((message) => message.event)).toEqual([
			"puzzle_completed",
		]);
		expect(finishAgain).toEqual([]);
	});

	it("counts the same player separately in each game", async () => {
		const store = new FakeStore();

		const mini = await send(store, { game: "mini" });
		const quadrat = await send(store, { game: "quadrat" });

		expect(mini).toHaveLength(1);
		expect(quadrat).toHaveLength(1);
		// The same id across games shows how many play more than one.
		expect(quadrat[0]?.distinctId).toBe(mini[0]?.distinctId);
	});

	it("never sends the account or guest id", async () => {
		const store = new FakeStore();

		const [message] = await send(store, {
			player: { kind: "user", id: "user-secret-id" },
		});

		expect(JSON.stringify(message)).not.toContain("user-secret-id");
	});

	it("touches nothing before the first guess", async () => {
		const store = new FakeStore();

		expect(await send(store, { started: false })).toEqual([]);
		expect(store.values.size).toBe(0);
	});
});

describe("recordPuzzleUsage", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		process.env.NODE_ENV = "production";
		storeRef.current = new FakeStore();
		captured.length = 0;
		backgroundTasks.length = 0;
	});

	afterEach(() => {
		vi.useRealTimers();
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("counts a player in the background", async () => {
		recordPuzzleUsage(usage({ completed: true }));
		await Promise.all(backgroundTasks);

		expect(captured.map((message) => message.event)).toEqual([
			"puzzle_started",
			"puzzle_completed",
		]);
	});

	it("ignores puzzles older than yesterday", () => {
		recordPuzzleUsage(usage({ dateKey: "2026-10-20" }));

		expect(backgroundTasks).toEqual([]);
	});

	it("does nothing without Redis", () => {
		storeRef.current = null;
		recordPuzzleUsage(usage());

		expect(backgroundTasks).toEqual([]);
	});

	it("sends nothing outside production", async () => {
		// The PostHog client is decided once per process, so load a fresh copy.
		process.env.NODE_ENV = "development";
		vi.resetModules();
		const fresh = await import("@/lib/usage-stats.server");

		fresh.recordPuzzleUsage(usage());

		expect(backgroundTasks).toEqual([]);
	});
});
