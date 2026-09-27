import { z } from "zod";
import { ANALYTICS_EVENT, GAME_MODE, HINT_TYPE } from "@/lib/analytics-events";

// Only reviewed product actions can cross the analytics boundary. Never add
// free-form text, account/device IDs, URLs, or error details to this schema.
export const umamiEventName = z.enum([
	ANALYTICS_EVENT.PAGEVIEW,
	ANALYTICS_EVENT.PAGELEAVE,
	ANALYTICS_EVENT.SHARE_PREVIEW_TOGGLED,
	ANALYTICS_EVENT.VIBRATION_TOGGLED,
	ANALYTICS_EVENT.LETTER_LAYOUT_CHANGED,
	ANALYTICS_EVENT.BONUS_CLUES_TOGGLED,
	ANALYTICS_EVENT.THEME_PREFERENCE_CHANGED,
	ANALYTICS_EVENT.PROFILE_UPDATED,
	ANALYTICS_EVENT.ANONYMOUS_HISTORY_IMPORTED,
	ANALYTICS_EVENT.AUTH_SIGN_IN_STARTED,
	ANALYTICS_EVENT.AUTH_SIGN_OUT_CLICKED,
	ANALYTICS_EVENT.PWA_LAUNCHED,
	ANALYTICS_EVENT.PWA_INSTALL_PROMPT_AVAILABLE,
	ANALYTICS_EVENT.PWA_INSTALL_PROMPT_CHOICE,
	ANALYTICS_EVENT.PWA_INSTALLED,
	ANALYTICS_EVENT.ANONYMOUS_PROGRESS_IMPORTED,
	ANALYTICS_EVENT.PUZZLE_EVENTS_SYNCED,
	ANALYTICS_EVENT.HOW_TO_PLAY_SHOWN,
	ANALYTICS_EVENT.PROFILE_PREFERENCES_TIP_SHOWN,
	ANALYTICS_EVENT.WELCOME_SHOWN,
	ANALYTICS_EVENT.WELCOME_DISMISSED,
	ANALYTICS_EVENT.PUZZLE_LOADED,
	ANALYTICS_EVENT.PUZZLE_COMPLETED,
	ANALYTICS_EVENT.PUZZLE_GUESS_RESULT,
	ANALYTICS_EVENT.BONUS_CLUE_GRANTED,
	ANALYTICS_EVENT.PUZZLE_LETTERS_SHUFFLED,
	ANALYTICS_EVENT.PUZZLE_HINT_REQUESTED,
	ANALYTICS_EVENT.PEER_CLUE_REQUESTED,
	ANALYTICS_EVENT.DAILY_PUZZLE_GENERATED,
	ANALYTICS_EVENT.HISTORY_PAGE_LOADED_SERVER,
	ANALYTICS_EVENT.ANONYMOUS_PROGRESS_IMPORTED_SERVER,
	ANALYTICS_EVENT.PUZZLE_PROGRESS_SYNCED_SERVER,
]);

const count = z
	.number()
	.int()
	.nonnegative()
	.max(1_000_000)
	.optional()
	.catch(undefined);
const flag = z.boolean().optional().catch(undefined);
const propertiesSchema = z.object({
	game_mode: z.enum(GAME_MODE).optional().catch(undefined),
	hint_type: z.enum(HINT_TYPE).optional().catch(undefined),
	skip: flag,
	enabled: flag,
	completed: flag,
	matched: flag,
	is_authenticated: flag,
	is_standalone: flag,
	has_account_history: flag,
	active_progress_count: count,
	imported_dates: count,
	legacy_dates: count,
	acked_events: count,
	queued_events: count,
	rows: count,
	total_words: count,
	guess_count: count,
	hints_used: count,
	guess_length: count,
	bonus_words_found: count,
	hints_used_after: count,
	word_count: count,
	history_entry_count: count,
	yesterday_leaderboard_entry_count: count,
	merged_leaderboard_dates: count,
	acked_event_count: count,
	guessed_word_count: count,
	sanitized_invalid_unlock_token_count: count,
	sanitized_missing_word_count: count,
	received_event_count: count,
	layout: z.enum(["circle", "grid", "line"]).optional().catch(undefined),
	theme: z.enum(["light", "dark", "system"]).optional().catch(undefined),
	choice: z.enum(["anonymous", "google"]).optional().catch(undefined),
	provider: z.literal("google").optional().catch(undefined),
	trigger: z.enum(["first_visit", "return_visit"]).optional().catch(undefined),
	outcome: z.enum(["accepted", "dismissed"]).optional().catch(undefined),
	avatar_preference: z.enum(["google", "initials"]).optional().catch(undefined),
	display_mode: z
		.enum([
			"browser",
			"standalone",
			"fullscreen",
			"minimal-ui",
			"window-controls-overlay",
			"ios-standalone",
			"unknown",
		])
		.optional()
		.catch(undefined),
	result_kind: z
		.enum([
			"invalid_input",
			"new_word",
			"already_found",
			"valid_but_not_in_puzzle",
			"not_in_dictionary",
		])
		.optional()
		.catch(undefined),
});

export function toUmamiProperties(properties?: Record<string, unknown>) {
	return propertiesSchema.parse(properties ?? {});
}

const paths = new Set([
	"/",
	"/mini",
	"/mini/",
	"/preferencies",
	"/sobre-el-joc",
	"/classificacio",
	"/dies-anteriors",
	"/mini/dies-anteriors",
	"/server",
	"/other",
]);

export function toUmamiPath(path: string) {
	const pathname = path.split(/[?#]/, 1)[0];
	return paths.has(pathname) ? pathname : "/other";
}
