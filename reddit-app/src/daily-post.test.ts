import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type DailyPostDeps,
	getMadridDateKey,
	postDailyPuzzle,
	postedKey,
} from "./daily-post.ts";

// 00:00:30 in Madrid (CEST, UTC+2) on 8 Oct 2026.
const JUST_AFTER_MIDNIGHT = new Date("2026-10-07T22:00:30Z");

type Harness = {
	deps: DailyPostDeps;
	values: Map<string, string>;
	posts: string[];
	pins: string[];
	unpins: string[];
};

function harness(
	options: {
		now?: Date;
		failSubmit?: boolean;
		failPin?: boolean;
		failUnpin?: boolean;
	} = {},
): Harness {
	const values = new Map<string, string>();
	const posts: string[] = [];
	const pins: string[] = [];
	const unpins: string[] = [];

	const deps: DailyPostDeps = {
		now: () => options.now ?? JUST_AFTER_MIDNIGHT,
		store: {
			get: async (key) => values.get(key),
			set: async (key, value) => {
				values.set(key, value);
			},
			acquire: async (key) => {
				if (values.has(key)) return false;
				values.set(key, "1");
				return true;
			},
		},
		submitPost: async (title) => {
			if (options.failSubmit) throw new Error("submit failed");
			posts.push(title);
			return "t3_abc123";
		},
		pinPost: async (postId) => {
			if (options.failPin) throw new Error("pin failed");
			pins.push(postId);
		},
		unpinPost: async (postId) => {
			if (options.failUnpin) throw new Error("post deleted");
			unpins.push(postId);
		},
	};

	return { deps, values, posts, pins, unpins };
}

describe("getMadridDateKey", () => {
	it("uses the Madrid calendar day, not UTC", () => {
		assert.equal(getMadridDateKey(JUST_AFTER_MIDNIGHT), "2026-10-08");
		assert.equal(
			getMadridDateKey(new Date("2026-10-07T21:59:59Z")),
			"2026-10-07",
		);
		// Winter time is UTC+1.
		assert.equal(
			getMadridDateKey(new Date("2026-12-31T23:00:00Z")),
			"2027-01-01",
		);
	});
});

describe("postDailyPuzzle", () => {
	it("posts the day's title as a text post", async () => {
		const h = harness();

		const outcome = await postDailyPuzzle(h.deps);

		assert.deepEqual(outcome, {
			status: "posted",
			dateKey: "2026-10-08",
			postId: "t3_abc123",
		});
		assert.deepEqual(h.posts, ["Garbuix #212 - 8/10/2026"]);
		assert.equal(h.values.get(postedKey("2026-10-08")), "t3_abc123");
	});

	it("posts only once per day", async () => {
		const h = harness();

		await postDailyPuzzle(h.deps);
		const second = await postDailyPuzzle(h.deps);

		assert.equal(second.status, "already-posted");
		assert.equal(h.posts.length, 1);
	});

	it("posts the next day's puzzle once Madrid passes midnight", async () => {
		const h = harness({ now: new Date("2026-10-08T22:00:30Z") });
		h.values.set(postedKey("2026-10-08"), "t3_yesterday");

		const outcome = await postDailyPuzzle(h.deps);

		assert.equal(outcome.status, "posted");
		assert.deepEqual(h.posts, ["Garbuix #213 - 9/10/2026"]);
	});

	it("leaves the day unposted when the submit fails", async () => {
		const h = harness({ failSubmit: true });

		await assert.rejects(postDailyPuzzle(h.deps), /submit failed/);

		assert.equal(h.values.has(postedKey("2026-10-08")), false);
	});

	it("leaves the day to an overlapping run that holds the lock", async () => {
		const h = harness();
		await h.deps.store.acquire("daily-post:lock:2026-10-08", 600);

		const outcome = await postDailyPuzzle(h.deps);

		assert.equal(outcome.status, "in-progress");
		assert.equal(h.posts.length, 0);
	});

	it("pins the new post in place of yesterday's", async () => {
		const h = harness();
		h.values.set("daily-post:pinned", "t3_yesterday");

		await postDailyPuzzle(h.deps);

		assert.deepEqual(h.unpins, ["t3_yesterday"]);
		assert.deepEqual(h.pins, ["t3_abc123"]);
		assert.equal(h.values.get("daily-post:pinned"), "t3_abc123");
	});

	it("does not pin again once today's post is pinned", async () => {
		const h = harness();

		await postDailyPuzzle(h.deps);
		await postDailyPuzzle(h.deps);

		assert.deepEqual(h.pins, ["t3_abc123"]);
	});

	it("retries a failed pin without posting again", async () => {
		const h = harness({ failPin: true });
		await assert.rejects(postDailyPuzzle(h.deps), /pin failed/);
		assert.equal(h.posts.length, 1);

		const retry = harness();
		retry.values.set(postedKey("2026-10-08"), "t3_abc123");
		const outcome = await postDailyPuzzle(retry.deps);

		assert.equal(outcome.status, "already-posted");
		assert.equal(retry.posts.length, 0);
		assert.deepEqual(retry.pins, ["t3_abc123"]);
	});

	it("still pins when yesterday's post can no longer be unpinned", async (t) => {
		const warn = t.mock.method(console, "warn", () => {});
		const h = harness({ failUnpin: true });
		h.values.set("daily-post:pinned", "t3_deleted");

		await postDailyPuzzle(h.deps);

		assert.deepEqual(h.pins, ["t3_abc123"]);
		assert.equal(warn.mock.callCount(), 1);
		assert.match(String(warn.mock.calls[0]?.arguments[0]), /t3_deleted/);
	});
});
