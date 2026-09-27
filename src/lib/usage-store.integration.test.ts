import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exportDailyUsage } from "./usage-export.server";
import { incrementUsage } from "./usage-store.server";

// Explicitly opt in against a disposable database, never the app's DATABASE_URL.
const url = process.env.USAGE_TEST_DATABASE_URL;
describe.skipIf(!url)("daily usage on PostgreSQL", () => {
	const sql = postgres(url ?? "postgres://unused", { max: 5 });
	const uploads: {
		body: string;
		cookie: string | undefined;
		userAgent: string | undefined;
	}[] = [];
	let fail = false;
	let destination: { host: string; key: string };
	const collector = createServer(async (request, response) => {
		let body = "";
		for await (const chunk of request) body += chunk.toString();
		uploads.push({
			body,
			cookie: request.headers.cookie,
			userAgent: request.headers["user-agent"],
		});
		response.writeHead(fail ? 503 : 200).end("{}");
	});
	beforeAll(async () => {
		if (!url || !new URL(url).pathname.includes("test"))
			throw new Error("A disposable test database is required");
		await sql.unsafe(readFileSync("drizzle/0010_anonymous_usage.sql", "utf8"));
		await new Promise<void>((resolve) =>
			collector.listen(0, "127.0.0.1", resolve),
		);
		const address = collector.address();
		if (!address || typeof address === "string")
			throw new Error("Missing test collector port");
		destination = { host: `http://127.0.0.1:${address.port}`, key: "test-key" };
	});
	beforeEach(async () => {
		await sql`TRUNCATE usage_daily`;
		uploads.length = 0;
		fail = false;
	});
	afterAll(async () => {
		await sql`DROP TABLE IF EXISTS usage_daily`;
		await sql.end();
		await new Promise<void>((resolve) => collector.close(() => resolve()));
	});
	it("atomically counts concurrent requests and never exports today's partial totals", async () => {
		await Promise.all(
			Array.from({ length: 50 }, () =>
				incrementUsage(sql, {
					event: "hint_requested",
					page: "classic",
					value: "text",
				}),
			),
		);
		const rows =
			await sql`SELECT *, day::text AS date_key, (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date::text AS today FROM usage_daily`;
		expect(rows).toHaveLength(1);
		expect(Number(rows[0].count)).toBe(50);
		expect(rows[0].date_key).toBe(rows[0].today);
		expect(await exportDailyUsage(sql, destination)).toBe(0);
		expect(uploads).toHaveLength(0);
	});
	it("exports completed days once across overlapping jobs, and purges expired counts", async () => {
		await sql`INSERT INTO usage_daily (day, event, page, count) VALUES
			((clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date - 1, 'page_view', 'mini', 123),
			((clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date - 91, 'page_view', 'classic', 999)`;
		const counts = await Promise.all([
			exportDailyUsage(sql, destination),
			exportDailyUsage(sql, destination),
		]);
		expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
		expect(uploads).toHaveLength(1);
		const body = JSON.parse(uploads[0].body);
		expect(body.batch[0].properties.count).toBe(123);
		expect(body.batch[0].properties.$process_person_profile).toBe(false);
		expect(uploads[0].cookie).toBeUndefined();
		expect(await sql`SELECT count(*)::int AS count FROM usage_daily`).toEqual([
			{ count: 1 },
		]);
	});
	it("retains failed exports and retries exactly the same payload", async () => {
		await sql`INSERT INTO usage_daily (day, event, page, value, count) VALUES
			((clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date - 1, 'hint_requested', 'mini', 'letter', 50)`;
		fail = true;
		await expect(exportDailyUsage(sql, destination)).rejects.toThrow(
			"HTTP 503",
		);
		expect((await sql`SELECT exported FROM usage_daily`)[0].exported).toBe(
			false,
		);
		fail = false;
		expect(await exportDailyUsage(sql, destination)).toBe(1);
		expect(uploads[1].body).toBe(uploads[0].body);
		expect(await exportDailyUsage(sql, destination)).toBe(0);
	});
	it("purges old counters even when export is disabled", async () => {
		await sql`INSERT INTO usage_daily (day, event, page) VALUES
			((clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date - 91, 'page_view', 'mini')`;
		expect(await exportDailyUsage(sql)).toBe(0);
		expect(await sql`SELECT * FROM usage_daily`).toHaveLength(0);
	});
});
