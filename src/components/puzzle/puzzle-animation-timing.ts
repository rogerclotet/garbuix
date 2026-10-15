const SUBMIT_FEEDBACK_DURATION_MS = 520;
const REDUCED_MOTION_SUBMIT_FEEDBACK_DURATION_MS = 200;
export function getSubmitFeedbackDuration() {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return SUBMIT_FEEDBACK_DURATION_MS;
	}

	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
		? REDUCED_MOTION_SUBMIT_FEEDBACK_DURATION_MS
		: SUBMIT_FEEDBACK_DURATION_MS;
}

// A found pangram's cells turn amber and back one after another. Each cell
// starts before the one ahead of it has finished, so the color travels along
// the word as a wave.
export const PANGRAM_WAVE_CELL_MS = 720;
export const PANGRAM_WAVE_STAGGER_MS = 55;

export function getPangramWaveDuration(cellCount: number): number {
	if (cellCount <= 0) {
		return 0;
	}

	return (cellCount - 1) * PANGRAM_WAVE_STAGGER_MS + PANGRAM_WAVE_CELL_MS;
}
