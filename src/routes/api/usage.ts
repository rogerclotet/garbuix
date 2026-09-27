import { createFileRoute } from "@tanstack/react-router";
import { sql } from "@/lib/db";
import { getServerEnv } from "@/lib/server-env";
import { handleUsageRequest } from "@/lib/usage-request.server";
import { incrementUsage } from "@/lib/usage-store.server";

export const Route = createFileRoute("/api/usage")({
	server: {
		handlers: {
			POST: ({ request }) =>
				handleUsageRequest(request, {
					enabled: getServerEnv().ANALYTICS_ENABLED,
					increment: (event) => incrementUsage(sql, event),
				}),
		},
	},
});
