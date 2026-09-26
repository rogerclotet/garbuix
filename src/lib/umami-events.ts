import { z } from "zod";

// Only reviewed product actions can cross the analytics boundary. Never add
// free-form text, account/device IDs, URLs, or error details to this schema.
export const umamiEventName = z.enum([
	"$pageview",
	"$pageleave",
	"share_preview_toggled",
	"vibration_toggled",
	"letter_layout_changed",
	"bonus_clues_toggled",
	"theme_preference_changed",
	"profile_updated",
	"anonymous_history_imported",
	"auth_sign_in_started",
	"auth_sign_out_clicked",
	"pwa_launched",
	"pwa_install_prompt_available",
	"pwa_install_prompt_choice",
	"pwa_installed",
	"anonymous_progress_imported",
	"puzzle_events_synced",
	"how_to_play_shown",
	"profile_preferences_tip_shown",
	"welcome_shown",
	"welcome_dismissed",
	"puzzle_loaded",
	"puzzle_completed",
	"puzzle_guess_result",
	"bonus_clue_granted",
	"puzzle_letters_shuffled",
	"puzzle_text_hint_requested",
	"puzzle_hint_requested",
	"peer_clue_requested",
	"daily_puzzle_generated",
	"history_page_loaded_server",
	"anonymous_progress_imported_server",
	"puzzle_progress_synced_server",
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
	game_mode: z.enum(["classic", "mini"]).optional().catch(undefined),
	hint_type: z.enum(["letter", "text"]).optional().catch(undefined),
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
