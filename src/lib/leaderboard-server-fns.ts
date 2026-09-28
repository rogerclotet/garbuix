import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getLeaderboard } from "@/lib/leaderboard.server";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";

const dateKeySchema = z.object({ dateKey: z.string().optional() }).optional();

export const getLeaderboardSnapshot = createServerFn({ method: "GET" })
	.inputValidator(dateKeySchema)
	.handler(async ({ data }) => {
		const dateKey = data?.dateKey ?? getTodayDateKey();
		return getLeaderboard(dateKey);
	});

export const getYesterdayLeaderboardSnapshot = createServerFn({
	method: "GET",
}).handler(async () => {
	return getLeaderboard(getYesterdayDateKey());
});
