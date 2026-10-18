import { useCallback, useEffect, useRef, useState } from "react";
import { HELD_FOUND_WORD_MS } from "@/components/puzzle/puzzle-animation-timing";

// The word just found, lit on the board for as long as it shows above it.
export function useFlashPath() {
	const [flashPath, setFlashPath] = useState<number[] | null>(null);
	const timerRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timerRef.current != null) window.clearTimeout(timerRef.current);
		},
		[],
	);

	const clearFlashPath = useCallback(() => {
		if (timerRef.current != null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setFlashPath(null);
	}, []);

	const flashFoundPath = useCallback((found: number[]) => {
		if (timerRef.current != null) window.clearTimeout(timerRef.current);
		setFlashPath(found);
		timerRef.current = window.setTimeout(() => {
			setFlashPath(null);
			timerRef.current = null;
		}, HELD_FOUND_WORD_MS);
	}, []);

	return { flashPath, flashFoundPath, clearFlashPath };
}
