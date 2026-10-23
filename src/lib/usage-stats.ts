import { z } from "zod";

// What a guest's Mini, Síl·labes or Quadrat sends once they start or finish the
// day's puzzle. Their progress otherwise stays in the browser, unlike classic
// guests (leaderboard report) and signed-in players (progress sync).
export const guestProgressReportSchema = z.strictObject({
	game: z.enum(["mini", "syllables", "quadrat"]),
	dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	completed: z.boolean(),
});

export type GuestProgressReport = z.infer<typeof guestProgressReportSchema>;
