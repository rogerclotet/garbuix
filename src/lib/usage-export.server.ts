import type { Sql } from "postgres";
import { z } from "zod";
import {
	USAGE_RETENTION_DAYS,
	USAGE_TIMEZONE,
	usageEventSchema,
} from "./usage-events";

const bucketSchema = z.object({
	id: z.uuid(),
	day: z.iso.date(),
	event: z.string(),
	page: z.string(),
	value: z.string(),
	count: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export function toPostHogAggregate(input: unknown) {
	const bucket = bucketSchema.parse(input);
	const event = usageEventSchema.parse({
		event: bucket.event,
		page: bucket.page,
		...(bucket.value ? { value: bucket.value } : {}),
	});
	return {
		// This ID names an aggregate bucket, never a player. The same UUID,
		// timestamp and distinct_id survive retries for PostHog deduplication.
		uuid: bucket.id,
		event: "daily_usage",
		timestamp: `${bucket.day}T12:00:00.000Z`,
		properties: {
			distinct_id: `aggregate:${bucket.id}`,
			$process_person_profile: false,
			$geoip_disable: true,
			day: bucket.day,
			timezone: USAGE_TIMEZONE,
			action: event.event,
			page: event.page,
			...("value" in event ? { value: event.value } : {}),
			count: bucket.count,
			schema_version: 1,
		},
	};
}

export async function exportDailyUsage(
	sql: Sql,
	destination?: { host: string; key: string },
) {
	// Purge runs even when collection/export is disabled or PostHog is down.
	await sql`DELETE FROM usage_daily WHERE day <= (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date - ${USAGE_RETENTION_DAYS}::int`;
	if (!destination) return 0;
	const endpoint = new URL(`${destination.host.replace(/\/$/, "")}/batch/`);
	return sql.begin(async (transaction) => {
		// Serialize overlapping scheduled/manual exports across processes.
		await transaction`SELECT pg_advisory_xact_lock(1734439522, 1)`;
		const rows = await transaction`
			SELECT id, day::text, event, page, value, count
			FROM usage_daily
			WHERE day < (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date AND NOT exported
			ORDER BY day, event, page, value FOR UPDATE
		`;
		for (let offset = 0; offset < rows.length; offset += 200) {
			const batch = rows.slice(offset, offset + 200).map(toPostHogAggregate);
			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: destination.key,
					historical_migration: true,
					batch,
				}),
				redirect: "error",
				signal: AbortSignal.timeout(15000),
			});
			await response.body?.cancel();
			if (!response.ok)
				throw new Error(
					`Daily aggregate export failed: HTTP ${response.status}`,
				);
			for (const event of batch) {
				await transaction`UPDATE usage_daily SET exported = true WHERE id = ${event.uuid}`;
			}
		}
		return rows.length;
	});
}
