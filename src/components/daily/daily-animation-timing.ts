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
