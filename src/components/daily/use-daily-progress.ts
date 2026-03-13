import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	buildAnonymousImportPayload,
	getAccountPuzzleCache,
	getAnonymousProgress,
	hasImportedAnonymousData,
	markAnonymousDataImported,
	saveAccountPuzzleCache,
	saveAnonymousHistoryEntry,
	saveAnonymousProgress,
} from "@/lib/puzzle-local";
import {
	applyPuzzleEvent,
	applyPuzzleEventsChronologically,
	createEmptyProgressState,
} from "@/lib/puzzle-progress";
import {
	getUserPuzzleProgress,
	importAnonymousProgress,
	syncUserPuzzleEvents,
} from "@/lib/puzzle-server-fns";
import type {
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";
import { useObservability } from "@/lib/use-observability";
import { buildHistoryEntry } from "./daily-helpers";
import type { DailyData, DailySessionUser } from "./daily-types";

type UseDailyProgressOptions = {
	activeUser: DailySessionUser;
	deviceId: string;
	initialData: DailyData;
};

export function useDailyProgress({
	activeUser,
	deviceId,
	initialData,
}: UseDailyProgressOptions) {
	const puzzle = initialData.puzzle;
	const totalWords = puzzle.wordSlots.length;
	const syncEvents = useServerFn(syncUserPuzzleEvents);
	const fetchUserProgress = useServerFn(getUserPuzzleProgress);
	const importProgress = useServerFn(importAnonymousProgress);
	const { captureEvent, captureException } = useObservability();

	const [baseProgress, setBaseProgress] = useState<PuzzleProgressState>(() => {
		const empty = createEmptyProgressState(puzzle);
		return (
			initialData.progress ?? getAnonymousProgress(puzzle.dateKey) ?? empty
		);
	});
	const [queuedEvents, setQueuedEvents] = useState<PuzzleClientEvent[]>([]);
	const [isOnline, setIsOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	const [isSyncing, setIsSyncing] = useState(false);
	const importAttemptedRef = useRef<string | null>(null);

	const derivedProgress = useMemo(
		() =>
			activeUser
				? applyPuzzleEventsChronologically(
						baseProgress,
						queuedEvents,
						totalWords,
					)
				: baseProgress,
		[activeUser, baseProgress, queuedEvents, totalWords],
	);

	const fetchLatestProgress = useCallback(async () => {
		if (!activeUser) {
			return null;
		}

		const empty = createEmptyProgressState(puzzle);
		return (
			(await fetchUserProgress({
				data: { puzzleId: puzzle.id },
			})) ??
			initialData.progress ??
			empty
		);
	}, [activeUser, fetchUserProgress, initialData.progress, puzzle]);

	useEffect(() => {
		let cancelled = false;

		const loadProgress = async () => {
			const empty = createEmptyProgressState(puzzle);

			if (activeUser) {
				const cached = getAccountPuzzleCache(activeUser.id, puzzle.dateKey);
				if (cached) {
					if (!cancelled) {
						setBaseProgress(
							cached.baseProgress ?? initialData.progress ?? empty,
						);
						setQueuedEvents(cached.queuedEvents ?? []);
					}
				} else if (!cancelled) {
					setBaseProgress(initialData.progress ?? empty);
					setQueuedEvents([]);
				}

				const latestProgress = await fetchLatestProgress();
				if (!cancelled && latestProgress) {
					setBaseProgress(latestProgress);
				}

				if (
					!hasImportedAnonymousData(activeUser.id) &&
					importAttemptedRef.current !== activeUser.id
				) {
					importAttemptedRef.current = activeUser.id;
					const payload = buildAnonymousImportPayload();

					if (
						payload.historyEntries.length > 0 ||
						Object.keys(payload.activeProgressByDate).length > 0
					) {
						try {
							const result = await importProgress({
								data: {
									deviceId,
									payload,
								},
							});
							markAnonymousDataImported(activeUser.id);
							captureEvent("anonymous_progress_imported", {
								active_progress_count: Object.keys(payload.activeProgressByDate)
									.length,
								imported_dates: result.importedDates.length,
								legacy_dates: result.skippedLegacyDates.length,
							});
							const refreshed = await fetchLatestProgress();
							if (!cancelled && refreshed) {
								setBaseProgress(refreshed);
							}
							toast.success("S'han sincronitzat els resultats locals");
						} catch (error) {
							console.error("Failed to import anonymous progress", error);
							captureException(error, {
								puzzle_date: puzzle.dateKey,
								scope: "anonymous_progress_import",
							});
						}
					} else {
						markAnonymousDataImported(activeUser.id);
					}
				}

				return;
			}

			if (!cancelled) {
				setQueuedEvents([]);
				setBaseProgress(getAnonymousProgress(puzzle.dateKey) ?? empty);
			}
		};

		void loadProgress();

		return () => {
			cancelled = true;
		};
	}, [
		activeUser,
		captureEvent,
		captureException,
		deviceId,
		fetchLatestProgress,
		importProgress,
		initialData.progress,
		puzzle,
	]);

	useEffect(() => {
		if (!activeUser || typeof window === "undefined") {
			return;
		}

		let cancelled = false;
		const refreshFromServer = async () => {
			if (!navigator.onLine) {
				return;
			}

			const latestProgress = await fetchLatestProgress();
			if (!cancelled && latestProgress) {
				setBaseProgress(latestProgress);
			}
		};

		const handleFocus = () => {
			void refreshFromServer();
		};

		window.addEventListener("focus", handleFocus);
		window.addEventListener("pageshow", handleFocus);

		return () => {
			cancelled = true;
			window.removeEventListener("focus", handleFocus);
			window.removeEventListener("pageshow", handleFocus);
		};
	}, [activeUser, fetchLatestProgress]);

	useEffect(() => {
		if (activeUser) {
			saveAccountPuzzleCache(activeUser.id, puzzle.dateKey, {
				baseProgress,
				queuedEvents,
			});
			return;
		}

		saveAnonymousProgress(puzzle.dateKey, derivedProgress);
		saveAnonymousHistoryEntry(buildHistoryEntry(puzzle, derivedProgress));
	}, [activeUser, baseProgress, derivedProgress, puzzle, queuedEvents]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const onOnline = () => setIsOnline(true);
		const onOffline = () => setIsOnline(false);
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);

		return () => {
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
		};
	}, []);

	useEffect(() => {
		if (!activeUser || queuedEvents.length === 0 || !isOnline || isSyncing) {
			return;
		}

		let cancelled = false;
		const pendingEvents = [...queuedEvents];

		setIsSyncing(true);
		void syncEvents({
			data: {
				puzzleId: puzzle.id,
				deviceId,
				events: pendingEvents,
			},
		})
			.then((result) => {
				if (cancelled) return;
				setBaseProgress(result.progress);
				setQueuedEvents((previous) =>
					previous.filter((event) => !result.ackedEventIds.includes(event.id)),
				);
				captureEvent("puzzle_events_synced", {
					acked_events: result.ackedEventIds.length,
					puzzle_id: puzzle.id,
					queued_events: pendingEvents.length,
				});
			})
			.catch((error) => {
				console.error("Failed to sync puzzle events", error);
				captureException(error, {
					puzzle_id: puzzle.id,
					scope: "puzzle_event_sync",
				});
			})
			.finally(() => {
				if (!cancelled) {
					setIsSyncing(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		activeUser,
		captureEvent,
		captureException,
		deviceId,
		isOnline,
		isSyncing,
		puzzle.id,
		queuedEvents,
		syncEvents,
	]);

	const applyLocalEvent = (event: PuzzleClientEvent) => {
		if (activeUser) {
			setQueuedEvents((previous) => [...previous, event]);
			return;
		}

		setBaseProgress((previous) =>
			applyPuzzleEvent(previous, event, totalWords),
		);
	};

	return {
		applyLocalEvent,
		derivedProgress,
	};
}
