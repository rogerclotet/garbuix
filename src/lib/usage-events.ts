import { z } from "zod";

export const USAGE_PATH = "/api/usage";
export const USAGE_TIMEZONE = "Europe/Madrid";
export const USAGE_RETENTION_DAYS = 90;

const page = z.enum([
	"classic",
	"mini",
	"classic_history",
	"mini_history",
	"preferences",
	"about",
	"leaderboard",
]);
const gamePage = z.enum(["classic", "mini"]);

// No arbitrary strings, timestamps, identifiers, or extra properties can cross
// this boundary. Adding a dimension requires a privacy assessment first.
export const usageEventSchema = z.discriminatedUnion("event", [
	z.strictObject({ event: z.literal("page_view"), page }),
	z.strictObject({ event: z.literal("help_opened"), page }),
	z.strictObject({ event: z.literal("letters_shuffled"), page: gamePage }),
	z.strictObject({
		event: z.literal("hint_requested"),
		page: gamePage,
		value: z.enum(["text", "letter"]),
	}),
	z.strictObject({
		event: z.literal("theme_selected"),
		page,
		value: z.enum(["system", "light", "dark"]),
	}),
	z.strictObject({
		event: z.literal("letter_layout_selected"),
		page: z.literal("preferences"),
		value: z.enum(["circle", "grid", "line"]),
	}),
	z.strictObject({
		event: z.literal("vibration_selected"),
		page: z.literal("preferences"),
		value: z.enum(["on", "off"]),
	}),
	z.strictObject({
		event: z.literal("bonus_clues_selected"),
		page: z.literal("preferences"),
		value: z.enum(["on", "off"]),
	}),
	z.strictObject({
		event: z.literal("share_preview_selected"),
		page: z.literal("preferences"),
		value: z.enum(["on", "off"]),
	}),
]);

export type UsageEvent = z.infer<typeof usageEventSchema>;
type WithoutPage<T> = T extends UsageEvent ? Omit<T, "page"> : never;
export type UsageAction = WithoutPage<UsageEvent>;

export function getUsagePage(pathname: string): UsageEvent["page"] | undefined {
	switch (pathname.replace(/\/$/, "") || "/") {
		case "/":
			return "classic";
		case "/mini":
			return "mini";
		case "/dies-anteriors":
			return "classic_history";
		case "/mini/dies-anteriors":
			return "mini_history";
		case "/preferencies":
			return "preferences";
		case "/sobre-el-joc":
			return "about";
		case "/classificacio":
			return "leaderboard";
		default:
			return undefined;
	}
}
