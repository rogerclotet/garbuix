import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getLeaderboard } from "@/lib/leaderboard.server";
import { observeServerAction } from "@/lib/observability-server";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";

const dateKeySchema = z.object({ dateKey: z.string().optional() }).optional();

export const getLeaderboardSnapshot = createServerFn({ method: "GET" })
	.inputValidator(dateKeySchema)
	.handler(async ({ data }) => {
		return observeServerAction("getLeaderboardSnapshot", async () => {
			const dateKey = data?.dateKey ?? getTodayDateKey();
			return getLeaderboard(dateKey);
		});
	});

export const getYesterdayLeaderboardSnapshot = createServerFn({
	method: "GET",
}).handler(async () => {
	return observeServerAction("getYesterdayLeaderboardSnapshot", async () => {
		return getLeaderboard(getYesterdayDateKey());
	});
});
