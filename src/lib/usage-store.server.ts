import type { Sql } from "postgres";
import type { UsageEvent } from "./usage-events";

export async function incrementUsage(sql: Sql, event: UsageEvent) {
	// The server assigns the day. Neither a browser timestamp nor a puzzle date
	// can backdate a submission into an already exported bucket.
	await sql`
		INSERT INTO usage_daily (day, event, page, value)
		VALUES ((clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date,
			${event.event}, ${event.page}, ${"value" in event ? event.value : ""})
		ON CONFLICT (day, event, page, value) DO UPDATE
		SET count = usage_daily.count + 1
		WHERE NOT usage_daily.exported
			AND usage_daily.day = (clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date
	`;
}
