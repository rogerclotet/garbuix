import { z } from "zod";

// What a guest's browser sends once they start or finish the day's puzzle, for
// the usage statistics. Signed-in players are counted from their progress sync.
export const guestProgressReportSchema = z.strictObject({
	game: z.enum(["regular", "mini", "syllables", "quadrat"]),
	dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	completed: z.boolean(),
});

export type GuestProgressReport = z.infer<typeof guestProgressReportSchema>;
