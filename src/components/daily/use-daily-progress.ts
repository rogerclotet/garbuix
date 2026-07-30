import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	getOrCreateAnonIdentity,
	getReportedAnonProgress,
	setReportedAnonProgress,
} from "@/lib/anon-identity";
import {
	buildAnonymousImportPayload,
	getAccountPuzzleCache,
	getAnonymousProgress,
	getStaleAccountCachesWithEvents,
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
	isSameProgressState,
	pickPreferredProgressState,
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
const PROGRESS_REVALIDATION_DELAYS_MS = [3_000, 10_000, 30_000];

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
	const activeUserId = activeUser?.id ?? null;
	const syncEvents = useServerFn(syncUserPuzzleEvents);
	const fetchUserProgress = useServerFn(getUserPuzzleProgress);
	const importProgress = useServerFn(importAnonymousProgress);
	const { captureEvent, captureException } = useObservability();
	const emptyProgress = useMemo(
		() => createEmptyProgressState(puzzle),
		[puzzle],
	);

	const [baseProgress, setBaseProgress] = useState<PuzzleProgressState>(
		() => getCompatibleProgress(initialData.progress, puzzle) ?? emptyProgress,
	);
	const [isProgressReady, setIsProgressReady] = useState(
		() => activeUser != null || initialData.progress != null,
	);
	const [queuedEvents, setQueuedEvents] = useState<PuzzleClientEvent[]>([]);
	const [isOnline, setIsOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	const [nextSyncRetryAt, setNextSyncRetryAt] = useState<number | null>(null);
	const importAttemptedRef = useRef<string | null>(null);
	const syncFailureCountRef = useRef(0);
	const hasActiveSyncFailureToastRef = useRef(false);
	const syncedOrphanedDaysRef = useRef<Set<string>>(new Set());
	const isSyncingRef = useRef(false);

	const derivedProgress = useMemo(
		() =>
			activeUserId
				? applyPuzzleEventsChronologically(
						baseProgress,
						queuedEvents,
						totalWords,
					)
				: baseProgress,
		[activeUserId, baseProgress, queuedEvents, totalWords],
	);

	const fetchLatestProgress = useCallback(async () => {
		if (!activeUserId) {
			return null;
		}

		try {
			return (
				(await fetchUserProgress({
					data: { puzzleId: puzzle.id },
				})) ??
				getCompatibleProgress(initialData.progress, puzzle) ??
				emptyProgress
			);
		} catch (error) {
			if (!isLikelyOfflineOrNetworkError(error)) {
				captureException(error, {
					puzzle_date: puzzle.dateKey,
					puzzle_id: puzzle.id,
					scope: "puzzle_progress_fetch",
				});
			}
			return (
				getCompatibleProgress(initialData.progress, puzzle) ?? emptyProgress
			);
		}
	}, [
		activeUserId,
		captureException,
		emptyProgress,
		fetchUserProgress,
		initialData.progress,
		puzzle,
	]);

	const refreshProgressFromServer = useCallback(async () => {
		const latestProgress = await fetchLatestProgress();
		if (latestProgress) {
			setBaseProgress((current) => {
				const next =
					pickPreferredProgressState(current, latestProgress) ?? latestProgress;
				return isSameProgressState(current, next) ? current : next;
			});
		}
	}, [fetchLatestProgress]);

	useEffect(() => {
		let cancelled = false;

		const loadProgress = async () => {
			if (activeUserId) {
				if (!cancelled) {
					setIsProgressReady(true);
				}

				const cached = getAccountPuzzleCache(activeUserId, puzzle.dateKey);
				if (cached?.puzzleId === puzzle.id) {
					const cachedQueuedEvents = cached.queuedEvents ?? [];
					const cachedBaseProgress =
						getCompatibleProgress(cached.baseProgress, puzzle) ?? null;
					const serverBaseProgress =
						getCompatibleProgress(initialData.progress, puzzle) ?? null;
					const preferredCachedBase =
						cachedQueuedEvents.length > 0
							? (pickPreferredProgressState(
									serverBaseProgress,
									cachedBaseProgress,
								) ?? emptyProgress)
							: (serverBaseProgress ?? cachedBaseProgress ?? emptyProgress);

					if (!cancelled) {
						setBaseProgress((current) =>
							isSameProgressState(current, preferredCachedBase)
								? current
								: preferredCachedBase,
						);
						setQueuedEvents((current) =>
							current === cachedQueuedEvents ? current : cachedQueuedEvents,
						);
					}
				} else if (!cancelled) {
					const nextBaseProgress =
						getCompatibleProgress(initialData.progress, puzzle) ??
						emptyProgress;
					setBaseProgress((current) =>
						isSameProgressState(current, nextBaseProgress)
							? current
							: nextBaseProgress,
					);
					setQueuedEvents((current) => (current.length === 0 ? current : []));
				}

				if (!cancelled) {
					await refreshProgressFromServer();
				}

				if (
					!hasImportedAnonymousData(activeUserId) &&
					importAttemptedRef.current !== activeUserId
				) {
					importAttemptedRef.current = activeUserId;
					const payload = buildAnonymousImportPayload();
					const hasLocalProgress =
						payload.historyEntries.length > 0 ||
						Object.keys(payload.activeProgressByDate).length > 0;

					try {
						const result = await importProgress({
							data: {
								deviceId,
								payload,
							},
						});
						markAnonymousDataImported(activeUserId);
						if (hasLocalProgress) {
							captureEvent("anonymous_progress_imported", {
								active_progress_count: Object.keys(payload.activeProgressByDate)
									.length,
								imported_dates: result.importedDates.length,
								legacy_dates: result.skippedLegacyDates.length,
							});
							if (!cancelled) {
								await refreshProgressFromServer();
							}
							toast.success("S'han sincronitzat els resultats locals");
						}
					} catch (error) {
						console.error("Failed to import anonymous progress", error);
						if (!isLikelyOfflineOrNetworkError(error)) {
							captureException(error, {
								puzzle_date: puzzle.dateKey,
								scope: "anonymous_progress_import",
							});
						}
					}
				}

				return;
			}

			if (!cancelled) {
				setIsProgressReady(false);
			}

			if (!cancelled) {
				setQueuedEvents((current) => (current.length === 0 ? current : []));
				const nextBaseProgress =
					getCompatibleProgress(getAnonymousProgress(puzzle.dateKey), puzzle) ??
					getCompatibleProgress(initialData.progress, puzzle) ??
					emptyProgress;
				setBaseProgress((current) =>
					isSameProgressState(current, nextBaseProgress)
						? current
						: nextBaseProgress,
				);
				setIsProgressReady(true);
			}
		};

		void loadProgress();

		return () => {
			cancelled = true;
		};
	}, [
		activeUserId,
		captureEvent,
		captureException,
		deviceId,
		emptyProgress,
		importProgress,
		initialData.progress,
		puzzle,
		refreshProgressFromServer,
	]);

	useEffect(() => {
		if (!activeUserId || typeof window === "undefined") {
			return;
		}

		let cancelled = false;
		const refreshFromServer = async () => {
			if (!navigator.onLine) {
				return;
			}

			await refreshProgressFromServer();
			if (cancelled) {
				return;
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
	}, [activeUserId, refreshProgressFromServer]);

	useEffect(() => {
		if (!activeUserId || !isOnline || typeof window === "undefined") {
			return;
		}

		let cancelled = false;
		const timeoutIds = PROGRESS_REVALIDATION_DELAYS_MS.map((delayMs) =>
			window.setTimeout(() => {
				void refreshProgressFromServer().then(() => {
					if (cancelled) {
						return;
					}
				});
			}, delayMs),
		);

		return () => {
			cancelled = true;
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}
		};
	}, [activeUserId, isOnline, refreshProgressFromServer]);

	useEffect(() => {
		if (activeUserId) {
			saveAccountPuzzleCache(activeUserId, puzzle.dateKey, {
				puzzleId: puzzle.id,
				baseProgress,
				queuedEvents,
			});
			return;
		}

		saveAnonymousProgress(puzzle.dateKey, derivedProgress);
		saveAnonymousHistoryEntry(buildHistoryEntry(puzzle, derivedProgress));
	}, [activeUserId, baseProgress, derivedProgress, puzzle, queuedEvents]);

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
		if (activeUserId || !hasActiveSyncFailureToastRef.current) {
			return;
		}

		hasActiveSyncFailureToastRef.current = false;
		syncFailureCountRef.current = 0;
		setNextSyncRetryAt(null);
		toast.dismiss(SYNC_FAILURE_TOAST_ID);
	}, [activeUserId]);

	useEffect(() => {
		if (
			!activeUserId ||
			queuedEvents.length === 0 ||
			!isOnline ||
			isSyncingRef.current
		) {
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
		isSyncingRef.current = true;
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
				const replayedServerProgress = applyPuzzleEventsChronologically(
					result.progress,
					pendingEvents,
					totalWords,
				);
				const shouldDropRedundantEvents =
					result.ackedEventIds.length === 0 &&
					isSameProgressState(result.progress, replayedServerProgress);
				const eventIdsToClear = new Set(
					shouldDropRedundantEvents
						? pendingEvents.map((event) => event.id)
						: result.ackedEventIds,
				);
				setBaseProgress(result.progress);
				setQueuedEvents((previous) =>
					previous.filter((event) => !eventIdsToClear.has(event.id)),
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
				if (failureCount >= 3 && !isNetworkError) {
					console.warn(
						`[sync] ${pendingEvents.length} pending event(s) not reaching server after ${failureCount} attempt(s)`,
					);
				}
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
				isSyncingRef.current = false;
			});

		return () => {
			cancelled = true;
		};
	}, [
		activeUserId,
		captureEvent,
		captureException,
		deviceId,
		isOnline,
		nextSyncRetryAt,
		puzzle.id,
		queuedEvents,
		syncEvents,
		totalWords,
	]);

	useEffect(() => {
		if (!activeUserId || !isOnline) return;

		const staleCaches = getStaleAccountCachesWithEvents(
			activeUserId,
			puzzle.dateKey,
		);
		if (staleCaches.length === 0) return;

		for (const { dateKey, cache } of staleCaches) {
			if (syncedOrphanedDaysRef.current.has(dateKey)) continue;
			syncedOrphanedDaysRef.current.add(dateKey);

			void syncEvents({
				data: {
					puzzleId: cache.puzzleId,
					deviceId,
					events: cache.queuedEvents ?? [],
				},
			})
				.then((result) => {
					const remainingEvents = (cache.queuedEvents ?? []).filter(
						(event) => !result.ackedEventIds.includes(event.id),
					);
					saveAccountPuzzleCache(activeUserId, dateKey, {
						...cache,
						queuedEvents: remainingEvents,
					});
				})
				.catch((error) => {
					console.error(
						"Failed to sync stale puzzle events for",
						dateKey,
						error,
					);
					syncedOrphanedDaysRef.current.delete(dateKey);
				});
		}
	}, [activeUserId, deviceId, isOnline, puzzle.dateKey, syncEvents]);

	const lastReportedAnonRef = useRef<{
		dateKey: string | null;
		wordsFound: number;
		completedAt: string | null;
	}>({ dateKey: null, wordsFound: 0, completedAt: null });

	useEffect(() => {
		if (activeUserId) {
			lastReportedAnonRef.current = {
				dateKey: null,
				wordsFound: 0,
				completedAt: null,
			};
			return;
		}
		if (typeof window === "undefined") return;

		if (lastReportedAnonRef.current.dateKey !== puzzle.dateKey) {
			const stored = getReportedAnonProgress(puzzle.dateKey);
			lastReportedAnonRef.current = {
				dateKey: puzzle.dateKey,
				wordsFound: stored.wordsFound,
				completedAt: stored.completedAt,
			};
		}

		const wordsFound = derivedProgress.guessedWordIds.length;
		const completedAt = derivedProgress.completedAt ?? null;
		const prev = lastReportedAnonRef.current;
		if (wordsFound <= prev.wordsFound && completedAt === prev.completedAt) {
			return;
		}

		const identity = getOrCreateAnonIdentity();
		const previousWordsFound = prev.wordsFound;
		const previousCompletedAt = prev.completedAt;
		lastReportedAnonRef.current = {
			dateKey: puzzle.dateKey,
			wordsFound,
			completedAt,
		};
		setReportedAnonProgress(puzzle.dateKey, { wordsFound, completedAt });

		void fetch(`/api/leaderboard/${puzzle.dateKey}/anon`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				deviceId: identity.deviceId,
				name: identity.name,
				wordsFound,
				totalWords,
				// Self-serve hints only; peer clues don't affect the score.
				clueCount: derivedProgress.hintsUsed,
				tryCount: derivedProgress.guessCount,
				completedAt,
				previousWordsFound,
				previousCompletedAt,
			}),
		}).catch(() => {
			// non-fatal: leaderboard reporting can quietly fail
		});
	}, [
		activeUserId,
		derivedProgress.guessedWordIds.length,
		derivedProgress.completedAt,
		derivedProgress.hintsUsed,
		derivedProgress.guessCount,
		puzzle.dateKey,
		totalWords,
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
		isProgressReady,
	};
}
