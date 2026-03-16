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
	getCompatibleProgress,
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

const SYNC_FAILURE_TOAST_ID = "daily-progress-sync-failure";
const SYNC_INITIAL_RETRY_DELAY_MS = 2_000;
const SYNC_MAX_RETRY_DELAY_MS = 30_000;

function isLikelyOfflineOrNetworkError(error: unknown) {
	if (typeof navigator !== "undefined" && !navigator.onLine) {
		return true;
	}

	if (error instanceof DOMException && error.name === "AbortError") {
		return true;
	}

	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";

	const normalizedMessage = message.toLowerCase();

	return (
		normalizedMessage.includes("failed to fetch") ||
		normalizedMessage.includes("networkerror") ||
		normalizedMessage.includes("network error") ||
		normalizedMessage.includes("load failed")
	);
}

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
			getCompatibleProgress(initialData.progress, puzzle) ??
			getCompatibleProgress(getAnonymousProgress(puzzle.dateKey), puzzle) ??
			empty
		);
	});
	const [queuedEvents, setQueuedEvents] = useState<PuzzleClientEvent[]>([]);
	const [isOnline, setIsOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	const [isSyncing, setIsSyncing] = useState(false);
	const [nextSyncRetryAt, setNextSyncRetryAt] = useState<number | null>(null);
	const importAttemptedRef = useRef<string | null>(null);
	const syncFailureCountRef = useRef(0);
	const hasActiveSyncFailureToastRef = useRef(false);

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
		try {
			return (
				(await fetchUserProgress({
					data: { puzzleId: puzzle.id },
				})) ??
				getCompatibleProgress(initialData.progress, puzzle) ??
				empty
			);
		} catch (error) {
			if (!isLikelyOfflineOrNetworkError(error)) {
				captureException(error, {
					puzzle_date: puzzle.dateKey,
					puzzle_id: puzzle.id,
					scope: "puzzle_progress_fetch",
				});
			}
			return getCompatibleProgress(initialData.progress, puzzle) ?? empty;
		}
	}, [
		activeUser,
		captureException,
		fetchUserProgress,
		initialData.progress,
		puzzle,
	]);

	useEffect(() => {
		let cancelled = false;

		const loadProgress = async () => {
			const empty = createEmptyProgressState(puzzle);

			if (activeUser) {
				const cached = getAccountPuzzleCache(activeUser.id, puzzle.dateKey);
				if (cached?.puzzleId === puzzle.id) {
					if (!cancelled) {
						setBaseProgress(
							getCompatibleProgress(cached.baseProgress, puzzle) ??
								getCompatibleProgress(initialData.progress, puzzle) ??
								empty,
						);
						setQueuedEvents(cached.queuedEvents ?? []);
					}
				} else if (!cancelled) {
					setBaseProgress(
						getCompatibleProgress(initialData.progress, puzzle) ?? empty,
					);
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
							if (!isLikelyOfflineOrNetworkError(error)) {
								captureException(error, {
									puzzle_date: puzzle.dateKey,
									scope: "anonymous_progress_import",
								});
							}
						}
					} else {
						markAnonymousDataImported(activeUser.id);
					}
				}

				return;
			}

			if (!cancelled) {
				setQueuedEvents([]);
				setBaseProgress(
					getCompatibleProgress(getAnonymousProgress(puzzle.dateKey), puzzle) ??
						empty,
				);
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
				puzzleId: puzzle.id,
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
		if (activeUser || !hasActiveSyncFailureToastRef.current) {
			return;
		}

		hasActiveSyncFailureToastRef.current = false;
		syncFailureCountRef.current = 0;
		setNextSyncRetryAt(null);
		toast.dismiss(SYNC_FAILURE_TOAST_ID);
	}, [activeUser]);

	useEffect(() => {
		if (!activeUser || queuedEvents.length === 0 || !isOnline || isSyncing) {
			return;
		}

		if (nextSyncRetryAt && nextSyncRetryAt > Date.now()) {
			const retryTimer = window.setTimeout(() => {
				setNextSyncRetryAt(null);
			}, nextSyncRetryAt - Date.now());

			return () => {
				window.clearTimeout(retryTimer);
			};
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
				if (hasActiveSyncFailureToastRef.current) {
					hasActiveSyncFailureToastRef.current = false;
					toast.dismiss(SYNC_FAILURE_TOAST_ID);
					toast.success("S'ha recuperat la sincronitzacio del progrés.");
				}
				syncFailureCountRef.current = 0;
				setNextSyncRetryAt(null);
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
				const failureCount = syncFailureCountRef.current + 1;
				const retryDelayMs = Math.min(
					SYNC_INITIAL_RETRY_DELAY_MS * 2 ** (failureCount - 1),
					SYNC_MAX_RETRY_DELAY_MS,
				);
				const isNetworkError = isLikelyOfflineOrNetworkError(error);

				syncFailureCountRef.current = failureCount;
				setNextSyncRetryAt(Date.now() + retryDelayMs);
				if (isNetworkError) {
					if (hasActiveSyncFailureToastRef.current) {
						hasActiveSyncFailureToastRef.current = false;
						toast.dismiss(SYNC_FAILURE_TOAST_ID);
					}
					return;
				}

				hasActiveSyncFailureToastRef.current = true;
				toast.error(
					"No s'ha pogut sincronitzar el teu progrés. El guardarem al dispositiu i ho tornarem a provar automàticament.",
					{
						duration: Number.POSITIVE_INFINITY,
						id: SYNC_FAILURE_TOAST_ID,
					},
				);
				captureException(error, {
					failure_count: failureCount,
					puzzle_id: puzzle.id,
					queued_event_count: pendingEvents.length,
					retry_delay_ms: retryDelayMs,
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
		nextSyncRetryAt,
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
