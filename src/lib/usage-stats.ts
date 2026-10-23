import { z } from "zod";

// A player who turns usage statistics off in Preferències. A cookie rather than
// localStorage, because the server counts players from requests it already
// receives and has to see the choice on each of them.
export const USAGE_STATS_OFF_COOKIE = "garbuix_stats_off";
// The longest lifetime browsers allow.
export const USAGE_STATS_OFF_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

// What a guest's Mini, Síl·labes or Quadrat sends once they start or finish the
// day's puzzle. Their progress otherwise stays in the browser, unlike classic
// guests (leaderboard report) and signed-in players (progress sync).
export const guestProgressReportSchema = z.strictObject({
	game: z.enum(["mini", "syllables", "quadrat"]),
	dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	completed: z.boolean(),
});

export type GuestProgressReport = z.infer<typeof guestProgressReportSchema>;
