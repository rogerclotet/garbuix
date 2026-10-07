import { createFileRoute } from "@tanstack/react-router";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import {
	checkDailyPuzzleExists,
	triggerDailyPuzzleGeneration,
} from "@/lib/puzzle-generation.server";
import { buildPuzzleHeadline } from "@/lib/puzzle-number";

// Retrying a minute later gives on-demand generation time to finish.
const RETRY_AFTER_SECONDS = 60;

export type DailyPostResponse = {
	dateKey: string;
	title: string;
	imagePath: string;
};

export const Route = createFileRoute("/api/daily-post")({
	server: {
		handlers: {
			GET: () => handleGet(),
		},
	},
});

// What the r/garbuix bot posts each day. The bot asks for today instead of
// working out the Madrid date itself, so rollover has one source of truth.
async function handleGet(): Promise<Response> {
	const dateKey = getTodayDateKey();

	if (!(await checkDailyPuzzleExists(dateKey))) {
		triggerDailyPuzzleGeneration(dateKey);
		return Response.json(
			{ error: "Today's puzzle is not ready yet" },
			{
				status: 503,
				headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
			},
		);
	}

	const body: DailyPostResponse = {
		dateKey,
		title: buildPuzzleHeadline(dateKey),
		imagePath: `/api/daily-image/${dateKey}.png`,
	};
	return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
