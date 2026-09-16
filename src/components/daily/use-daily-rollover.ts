import { useEffect, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

export function useDailyRollover(
	rolloverAt: string,
	refresh: () => Promise<void>,
) {
	const [expired, setExpired] = useState(false);
	const deadline = Date.parse(rolloverAt);

	useIsomorphicLayoutEffect(() => {
		const check = () => setExpired(Date.now() >= deadline);
		check();
		const timer = window.setTimeout(check, Math.max(0, deadline - Date.now()));
		window.addEventListener("focus", check);
		window.addEventListener("pageshow", check);
		document.addEventListener("visibilitychange", check);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("focus", check);
			window.removeEventListener("pageshow", check);
			document.removeEventListener("visibilitychange", check);
		};
	}, [deadline]);

	useEffect(() => {
		if (!expired) return;
		let cancelled = false;
		let inFlight = false;
		let timer: number | undefined;
		let retryDelay = 2_000;
		const attempt = async () => {
			if (
				cancelled ||
				inFlight ||
				!navigator.onLine ||
				document.visibilityState === "hidden"
			)
				return;
			window.clearTimeout(timer);
			inFlight = true;
			try {
				await refresh();
			} catch {
				// Keep the transition visible and retry when the server is reachable.
			} finally {
				inFlight = false;
				if (!cancelled) {
					timer = window.setTimeout(attempt, retryDelay);
					retryDelay = Math.min(retryDelay * 2, 30_000);
				}
			}
		};
		void attempt();
		window.addEventListener("online", attempt);
		window.addEventListener("pageshow", attempt);
		window.addEventListener("focus", attempt);
		document.addEventListener("visibilitychange", attempt);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
			window.removeEventListener("online", attempt);
			window.removeEventListener("pageshow", attempt);
			window.removeEventListener("focus", attempt);
			document.removeEventListener("visibilitychange", attempt);
		};
	}, [expired, refresh]);

	return expired;
}
