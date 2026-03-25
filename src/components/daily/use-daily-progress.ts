import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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

type SyncAttemptDebug = {
	acknowledgedCount: number;
	acceptedCount: number;
	duplicateInPayloadCount: number;
	endedAt: string;
	errorMessage: string | null;
	existingOnServerCount: number;
	pendingCount: number;
	pendingSample: PuzzleClientEvent["type"][];
	sanitizedInvalidUnlockTokenCount: number;
	sanitizedMissingWordCount: number;
	redundantClearedCount: number;
	serverGuessCount: number;
	serverGuessedWordCount: number;
	serverHintsUsed: number;
	startedAt: string;
};

type ServerSnapshotDebug = {
	at: string;
	guessCount: number;
	guessedWordCount: number;
	hintsUsed: number;
	lastSyncedAt: string | null;
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
	const [manualSyncVersion, setManualSyncVersion] = useState(0);
	const [lastServerSnapshot, setLastServerSnapshot] =
		useState<ServerSnapshotDebug | null>(() =>
			initialData.progress
				? {
						at: new Date().toISOString(),
						guessCount: initialData.progress.guessCount,
						guessedWordCount: initialData.progress.guessedWordIds.length,
						hintsUsed: initialData.progress.hintsUsed,
						lastSyncedAt: initialData.progress.lastSyncedAt,
					}
				: null,
		);
	const [lastSyncAttempt, setLastSyncAttempt] =
		useState<SyncAttemptDebug | null>(null);
	const importAttemptedRef = useRef<string | null>(null);
	const syncFailureCountRef = useRef(0);
	const hasActiveSyncFailureToastRef = useRef(false);
	const syncedOrphanedDaysRef = useRef<Set<string>>(new Set());
	const handledManualSyncVersionRef = useRef(0);

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

	const refreshProgressFromServer = useCallback(async () => {
		const latestProgress = await fetchLatestProgress();
		if (latestProgress) {
			setLastServerSnapshot({
				at: new Date().toISOString(),
				guessCount: latestProgress.guessCount,
				guessedWordCount: latestProgress.guessedWordIds.length,
				hintsUsed: latestProgress.hintsUsed,
				lastSyncedAt: latestProgress.lastSyncedAt,
			});
			setBaseProgress(
				(current) =>
					pickPreferredProgressState(current, latestProgress) ?? latestProgress,
			);
		}
	}, [fetchLatestProgress]);

	useEffect(() => {
		let cancelled = false;

		const loadProgress = async () => {
			const empty = createEmptyProgressState(puzzle);

			if (activeUser) {
				const cached = getAccountPuzzleCache(activeUser.id, puzzle.dateKey);
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
								) ?? empty)
							: (serverBaseProgress ?? cachedBaseProgress ?? empty);

					if (!cancelled) {
						setBaseProgress(preferredCachedBase);
						setQueuedEvents(cachedQueuedEvents);
					}
				} else if (!cancelled) {
					setBaseProgress(
						getCompatibleProgress(initialData.progress, puzzle) ?? empty,
					);
					setQueuedEvents([]);
				}

				if (!cancelled) {
					await refreshProgressFromServer();
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
							if (!cancelled) {
								await refreshProgressFromServer();
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
		importProgress,
		initialData.progress,
		puzzle,
		refreshProgressFromServer,
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
	}, [activeUser, refreshProgressFromServer]);

	useEffect(() => {
		if (!activeUser || !isOnline || typeof window === "undefined") {
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
	}, [activeUser, isOnline, refreshProgressFromServer]);

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

		const forceSyncRequested =
			manualSyncVersion !== handledManualSyncVersionRef.current;

		if (
			!forceSyncRequested &&
			nextSyncRetryAt &&
			nextSyncRetryAt > Date.now()
		) {
			const retryTimer = window.setTimeout(() => {
				setNextSyncRetryAt(null);
			}, nextSyncRetryAt - Date.now());

			return () => {
				window.clearTimeout(retryTimer);
			};
		}

		let cancelled = false;
		const pendingEvents = [...queuedEvents];
		handledManualSyncVersionRef.current = manualSyncVersion;
		const syncStartedAt = new Date().toISOString();

		setIsSyncing(true);
		setLastSyncAttempt({
			acknowledgedCount: 0,
			acceptedCount: 0,
			duplicateInPayloadCount: 0,
			endedAt: syncStartedAt,
			errorMessage: null,
			existingOnServerCount: 0,
			pendingCount: pendingEvents.length,
			pendingSample: pendingEvents.slice(-5).map((event) => event.type),
			sanitizedInvalidUnlockTokenCount: 0,
			sanitizedMissingWordCount: 0,
			redundantClearedCount: 0,
			serverGuessCount: baseProgress.guessCount,
			serverGuessedWordCount: baseProgress.guessedWordIds.length,
			serverHintsUsed: baseProgress.hintsUsed,
			startedAt: syncStartedAt,
		});
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
				const redundantClearedCount = shouldDropRedundantEvents
					? pendingEvents.length
					: 0;
				const eventIdsToClear = new Set(
					shouldDropRedundantEvents
						? pendingEvents.map((event) => event.id)
						: result.ackedEventIds,
				);
				setLastServerSnapshot({
					at: new Date().toISOString(),
					guessCount: result.progress.guessCount,
					guessedWordCount: result.progress.guessedWordIds.length,
					hintsUsed: result.progress.hintsUsed,
					lastSyncedAt: result.progress.lastSyncedAt,
				});
				setLastSyncAttempt({
					acknowledgedCount: result.ackedEventIds.length,
					acceptedCount: result.diagnostics.acceptedCount,
					duplicateInPayloadCount: result.diagnostics.duplicateInPayloadCount,
					endedAt: new Date().toISOString(),
					errorMessage: null,
					existingOnServerCount: result.diagnostics.existingOnServerCount,
					pendingCount: pendingEvents.length,
					pendingSample: pendingEvents.slice(-5).map((event) => event.type),
					sanitizedInvalidUnlockTokenCount:
						result.diagnostics.sanitizedInvalidUnlockTokenCount,
					sanitizedMissingWordCount:
						result.diagnostics.sanitizedMissingWordCount,
					redundantClearedCount,
					serverGuessCount: result.progress.guessCount,
					serverGuessedWordCount: result.progress.guessedWordIds.length,
					serverHintsUsed: result.progress.hintsUsed,
					startedAt: syncStartedAt,
				});
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
				setLastSyncAttempt({
					acknowledgedCount: 0,
					acceptedCount: 0,
					duplicateInPayloadCount: 0,
					endedAt: new Date().toISOString(),
					errorMessage:
						error instanceof Error ? error.message : "unknown sync error",
					existingOnServerCount: 0,
					pendingCount: pendingEvents.length,
					pendingSample: pendingEvents.slice(-5).map((event) => event.type),
					sanitizedInvalidUnlockTokenCount: 0,
					sanitizedMissingWordCount: 0,
					redundantClearedCount: 0,
					serverGuessCount: baseProgress.guessCount,
					serverGuessedWordCount: baseProgress.guessedWordIds.length,
					serverHintsUsed: baseProgress.hintsUsed,
					startedAt: syncStartedAt,
				});
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
		manualSyncVersion,
		nextSyncRetryAt,
		puzzle.id,
		queuedEvents,
		syncEvents,
		totalWords,
		baseProgress.guessCount,
		baseProgress.guessedWordIds.length,
		baseProgress.hintsUsed,
	]);

	useEffect(() => {
		if (!activeUser || !isOnline) return;

		const staleCaches = getStaleAccountCachesWithEvents(
			activeUser.id,
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
					saveAccountPuzzleCache(activeUser.id, dateKey, {
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
	}, [activeUser, deviceId, isOnline, puzzle.dateKey, syncEvents]);

	const applyLocalEvent = (event: PuzzleClientEvent) => {
		if (activeUser) {
			setQueuedEvents((previous) => [...previous, event]);
			return;
		}

		setBaseProgress((previous) =>
			applyPuzzleEvent(previous, event, totalWords),
		);
	};

	const forceSync = useCallback(async () => {
		if (!activeUser || !isOnline) {
			return;
		}

		if (queuedEvents.length > 0) {
			setNextSyncRetryAt(null);
			setManualSyncVersion((current) => current + 1);
			return;
		}

		await refreshProgressFromServer();
	}, [activeUser, isOnline, queuedEvents.length, refreshProgressFromServer]);

	return {
		applyLocalEvent,
		derivedProgress,
		syncDebug: {
			canSync: Boolean(activeUser),
			forceSync,
			isOnline,
			isSyncing,
			lastSyncedAt: derivedProgress.lastSyncedAt,
			lastSyncAttempt,
			lastServerSnapshot,
			nextSyncRetryAt,
			queuedEventCount: queuedEvents.length,
			recentQueueSample: queuedEvents.slice(-5).map((event) => event.type),
			shortDeviceId: deviceId.slice(-6),
		},
	};
}
