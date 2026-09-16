import { useState } from "react";
import { getNextRolloverAt, getTodayDateKey } from "@/lib/puzzle-dates";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

// Shared by the live clue and leaderboard connections, including inner pages.
export function useTodayDateKey(initialDateKey: string) {
	const [dateKey, setDateKey] = useState(initialDateKey);
	useIsomorphicLayoutEffect(() => {
		let timer: number;
		const check = () => {
			window.clearTimeout(timer);
			setDateKey(getTodayDateKey());
			timer = window.setTimeout(
				check,
				getNextRolloverAt().getTime() - Date.now(),
			);
		};
		check();
		window.addEventListener("focus", check);
		window.addEventListener("pageshow", check);
		document.addEventListener("visibilitychange", check);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("focus", check);
			window.removeEventListener("pageshow", check);
			document.removeEventListener("visibilitychange", check);
		};
	}, []);
	return dateKey;
}
