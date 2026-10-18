import { useCallback, useEffect, useRef, useState } from "react";
import { getSubmitFeedbackDuration } from "@/components/puzzle/puzzle-animation-timing";
import type { PuzzleSubmitFeedback } from "@/components/puzzle/puzzle-types";

// The verdict on the last guess, shown over the input panel until its
// animation ends.
export function useSubmitFeedback() {
	const [submitFeedback, setSubmitFeedback] =
		useState<PuzzleSubmitFeedback | null>(null);
	const submitFeedbackIdRef = useRef(0);
	const submitFeedbackResetTimerRef = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (submitFeedbackResetTimerRef.current != null) {
				window.clearTimeout(submitFeedbackResetTimerRef.current);
			}
		},
		[],
	);

	const showSubmitFeedback = useCallback(
		(word: string, kind: PuzzleSubmitFeedback["kind"]) => {
			const nextFeedbackId = submitFeedbackIdRef.current + 1;
			submitFeedbackIdRef.current = nextFeedbackId;
			setSubmitFeedback({
				id: nextFeedbackId,
				word,
				kind,
			});

			if (submitFeedbackResetTimerRef.current != null) {
				window.clearTimeout(submitFeedbackResetTimerRef.current);
			}

			submitFeedbackResetTimerRef.current = window.setTimeout(() => {
				setSubmitFeedback((current) =>
					current?.id === nextFeedbackId ? null : current,
				);
				submitFeedbackResetTimerRef.current = null;
			}, getSubmitFeedbackDuration());
		},
		[],
	);

	const clearSubmitFeedback = useCallback(() => {
		if (submitFeedbackResetTimerRef.current != null) {
			window.clearTimeout(submitFeedbackResetTimerRef.current);
			submitFeedbackResetTimerRef.current = null;
		}
		setSubmitFeedback(null);
	}, []);

	return { submitFeedback, showSubmitFeedback, clearSubmitFeedback };
}
