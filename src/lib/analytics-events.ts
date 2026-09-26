export const GAME_MODE = Object.freeze({
	CLASSIC: "classic",
	MINI: "mini",
});

export const HINT_TYPE = Object.freeze({
	TEXT: "text",
	LETTER: "letter",
});

export const ANALYTICS_EVENT = Object.freeze({
	PAGEVIEW: "$pageview",
	PAGELEAVE: "$pageleave",
	SHARE_PREVIEW_TOGGLED: "share_preview_toggled",
	VIBRATION_TOGGLED: "vibration_toggled",
	LETTER_LAYOUT_CHANGED: "letter_layout_changed",
	BONUS_CLUES_TOGGLED: "bonus_clues_toggled",
	THEME_PREFERENCE_CHANGED: "theme_preference_changed",
	PROFILE_UPDATED: "profile_updated",
	ANONYMOUS_HISTORY_IMPORTED: "anonymous_history_imported",
	AUTH_SIGN_IN_STARTED: "auth_sign_in_started",
	AUTH_SIGN_OUT_CLICKED: "auth_sign_out_clicked",
	PWA_LAUNCHED: "pwa_launched",
	PWA_INSTALL_PROMPT_AVAILABLE: "pwa_install_prompt_available",
	PWA_INSTALL_PROMPT_CHOICE: "pwa_install_prompt_choice",
	PWA_INSTALLED: "pwa_installed",
	ANONYMOUS_PROGRESS_IMPORTED: "anonymous_progress_imported",
	PUZZLE_EVENTS_SYNCED: "puzzle_events_synced",
	HOW_TO_PLAY_SHOWN: "how_to_play_shown",
	PROFILE_PREFERENCES_TIP_SHOWN: "profile_preferences_tip_shown",
	WELCOME_SHOWN: "welcome_shown",
	WELCOME_DISMISSED: "welcome_dismissed",
	PUZZLE_LOADED: "puzzle_loaded",
	PUZZLE_COMPLETED: "puzzle_completed",
	PUZZLE_GUESS_RESULT: "puzzle_guess_result",
	BONUS_CLUE_GRANTED: "bonus_clue_granted",
	PUZZLE_LETTERS_SHUFFLED: "puzzle_letters_shuffled",
	PUZZLE_HINT_REQUESTED: "puzzle_hint_requested",
	PEER_CLUE_REQUESTED: "peer_clue_requested",
	DAILY_PUZZLE_GENERATED: "daily_puzzle_generated",
	HISTORY_PAGE_LOADED_SERVER: "history_page_loaded_server",
	ANONYMOUS_PROGRESS_IMPORTED_SERVER: "anonymous_progress_imported_server",
	PUZZLE_PROGRESS_SYNCED_SERVER: "puzzle_progress_synced_server",
});
