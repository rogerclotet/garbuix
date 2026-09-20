// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getAccountPuzzleCache,
	saveAccountPuzzleCache,
	saveAnonymousProgress,
} from "@/lib/puzzle-local";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import type {
	DailyPuzzlePublic,
	PuzzleClientEvent,
	PuzzleProgressState,
	SessionUser,
} from "@/lib/puzzle-types";
import type { DailyData } from "./daily-types";
import { useDailyProgress } from "./use-daily-progress";

const {
	fetchUserProgressMock,
	importProgressMock,
	syncEventsMock,
	captureEvent,
	captureException,
} = vi.hoisted(() => ({
	captureEvent: vi.fn(),
	captureException: vi.fn(),
	fetchUserProgressMock: vi.fn(),
	importProgressMock: vi.fn(),
	syncEventsMock: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	useServerFn: (serverFn: unknown) => serverFn,
}));

vi.mock("@/lib/puzzle-server-fns", () => ({
	getUserPuzzleProgress: fetchUserProgressMock,
	importAnonymousProgress: importProgressMock,
	syncUserPuzzleEvents: syncEventsMock,
}));

vi.mock("@/lib/use-observability", () => ({
	useObservability: () => ({
		captureEvent,
		captureException,
	}),
}));

vi.mock("@/lib/anon-identity", () => ({
	getOrCreateAnonIdentity: () => ({ deviceId: "device-1", name: "Convidat" }),
	getReportedAnonProgress: () => ({
		wordsFound: 0,
		tryCount: 0,
		clueCount: 0,
		completedAt: null,
	}),
	setReportedAnonProgress: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: Object.assign(vi.fn(), {
		dismiss: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
	}),
}));

function deferred<T>() {
	let resolve: (value: T) => void = vi.fn();
	const promise = new Promise<T>((onResolve) => {
		resolve = onResolve;
	});
	return { promise, resolve };
}

const DATE_KEY = "2026-06-11";
const USER_ID = "user-1";

function wordSlot(id: number): DailyPuzzlePublic["wordSlots"][number] {
	return {
		id,
		startRow: id - 1,
		startCol: 0,
		direction: "horizontal",
		length: 4,
		middleDotAfterIndices: [],
		slotSalt: `salt-${id}`,
		answerHash: `hash-${id}`,
		answerCapsule: `capsule-${id}`,
	};
}

const PUZZLE: DailyPuzzlePublic = {
	id: "puzzle-1",
	dateKey: DATE_KEY,
	seed: 20260611,
	algorithmVersion: "v1",
	rows: 2,
	cols: 4,
	gridMask: [],
	letters: ["c", "o", "s", "a"],
	initialShuffledLetters: ["a", "c", "o", "s"],
	validNormalizedGuesses: [],
	wordSlots: [wordSlot(1), wordSlot(2)],
	hintCapsules: [],
};

const INITIAL_DATA: DailyData = {
	historyEntries: null,
	puzzle: PUZZLE,
	progress: null,
	rolloverAt: "2026-06-12T00:00:00.000Z",
	sessionUser: null,
};

function progressWith(
	overrides: Partial<PuzzleProgressState>,
): PuzzleProgressState {
	return { ...createEmptyProgressState(PUZZLE), ...overrides };
}

// The environment's localStorage is non-functional under vitest, so the tests
// stub in a real in-memory store to stand in for a returning player's device.
function createMemoryStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (key: string) => store.get(key) ?? null,
		key: (index: number) => [...store.keys()][index] ?? null,
		removeItem: (key: string) => {
			store.delete(key);
		},
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
	};
}

function Probe({ activeUser }: { activeUser: SessionUser }) {
	const { derivedProgress, isReady } = useDailyProgress({
		activeUser,
		deviceId: "device-1",
		initialData: INITIAL_DATA,
	});

	return (
		<span>
			{isReady
				? `words:${derivedProgress.guessedWordIds.join(",")}`
				: "synchronizing"}
		</span>
	);
}

function SwitchableProbe({ activeUser }: { activeUser: SessionUser | null }) {
	const { derivedProgress } = useDailyProgress({
		activeUser,
		deviceId: "device-1",
		initialData: {
			...INITIAL_DATA,
			progress: activeUser
				? progressWith({
						guessedWordIds: [1, 2],
						guessCount: 7,
						completedAt: "2026-06-11T12:00:00.000Z",
					})
				: null,
			sessionUser: activeUser,
		},
	});

	return (
		<span>
			{`words:${derivedProgress.guessedWordIds.join(",")};completed:${derivedProgress.completedAt ?? "none"}`}
		</span>
	);
}

type ActEnvironment = { IS_REACT_ACT_ENVIRONMENT?: boolean };

// Renders outside act() so only the work React guarantees before the browser
// paints — the commit and its layout effects — has run when we assert. Progress
// left to a passive effect shows up here as an empty board, which is exactly the
// flash the hook is meant to avoid.
function renderBeforePaint(activeUser: SessionUser) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const actEnvironment = globalThis as ActEnvironment;
	const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
	actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;

	try {
		flushSync(() => {
			root.render(<Probe activeUser={activeUser} />);
		});
	} finally {
		actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
	}

	return {
		container,
		paintedText: container.textContent,
		async settle() {
			await act(async () => {});
		},
		unmount() {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
}

describe("useDailyProgress local state", () => {
	it("makes cached progress playable immediately while the initial fetch is pending", async () => {
		saveAccountPuzzleCache(USER_ID, DATE_KEY, {
			puzzleId: PUZZLE.id,
			baseProgress: progressWith({ guessedWordIds: [1], guessCount: 2 }),
			queuedEvents: [],
		});
		fetchUserProgressMock.mockReturnValue(new Promise(() => {}));
		const { result } = renderHook(() =>
			useDailyProgress({
				activeUser: { id: USER_ID, name: "Roger", email: "roger@example.com" },
				deviceId: "device-1",
				initialData: INITIAL_DATA,
			}),
		);
		expect(result.current.isReady).toBe(true);
		expect(result.current.derivedProgress.guessedWordIds).toEqual([1]);
		await act(async () => {});
		expect(fetchUserProgressMock).toHaveBeenCalled();
		expect(result.current.isReady).toBe(true);
	});

	it("keeps the board playable on resume and keeps polling after the first minute", async () => {
		vi.useFakeTimers();
		const visibility = vi
			.spyOn(document, "visibilityState", "get")
			.mockReturnValue("visible");
		try {
			const { result, unmount } = renderHook(() =>
				useDailyProgress({
					activeUser: {
						id: USER_ID,
						name: "Roger",
						email: "roger@example.com",
					},
					deviceId: "device-1",
					initialData: INITIAL_DATA,
				}),
			);
			await act(async () => {});
			expect(result.current.isReady).toBe(true);
			visibility.mockReturnValue("hidden");
			act(() => document.dispatchEvent(new Event("visibilitychange")));
			expect(result.current.isReady).toBe(true);
			fetchUserProgressMock.mockClear();
			await act(async () => {
				await vi.advanceTimersByTimeAsync(60_000);
			});
			expect(fetchUserProgressMock).not.toHaveBeenCalled();
			const remote = deferred<PuzzleProgressState>();
			fetchUserProgressMock.mockReturnValueOnce(remote.promise);
			visibility.mockReturnValue("visible");
			act(() => document.dispatchEvent(new Event("visibilitychange")));
			expect(result.current.isReady).toBe(true);
			await act(async () =>
				remote.resolve(progressWith({ guessedWordIds: [1], guessCount: 1 })),
			);
			expect(result.current.isReady).toBe(true);
			expect(result.current.derivedProgress.guessedWordIds).toEqual([1]);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(60_000);
			});
			expect(fetchUserProgressMock).toHaveBeenCalledTimes(3);
			unmount();
		} finally {
			visibility.mockRestore();
			vi.useRealTimers();
		}
	});

	it("keeps an offline account playable without waiting for the network", async () => {
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		try {
			const { result, unmount } = renderHook(() =>
				useDailyProgress({
					activeUser: {
						id: USER_ID,
						name: "Roger",
						email: "roger@example.com",
					},
					deviceId: "device-1",
					initialData: INITIAL_DATA,
				}),
			);
			expect(result.current.isReady).toBe(true);
			await act(async () => {});
			expect(fetchUserProgressMock).not.toHaveBeenCalled();
			unmount();
		} finally {
			online.mockRestore();
		}
	});

	it("backs off when the server cannot acknowledge a queued event", async () => {
		vi.useFakeTimers();
		try {
			syncEventsMock.mockResolvedValue({
				progress: progressWith({}),
				ackedEventIds: [],
			});
			const { result, unmount } = renderHook(() =>
				useDailyProgress({
					activeUser: {
						id: USER_ID,
						name: "Roger",
						email: "roger@example.com",
					},
					deviceId: "device-1",
					initialData: INITIAL_DATA,
				}),
			);
			await act(async () => {});
			await act(async () =>
				result.current.applyLocalEvent({
					id: "hint",
					at: "2026-06-11T10:00:00.000Z",
					type: "hint_used",
					payload: { cellKey: "0,0" },
				}),
			);
			expect(syncEventsMock).toHaveBeenCalledTimes(1);
			expect(result.current.pendingEventCount).toBe(1);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(29_000);
			});
			expect(syncEventsMock).toHaveBeenCalledTimes(1);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(1_000);
			});
			expect(syncEventsMock).toHaveBeenCalledTimes(2);
			unmount();
		} finally {
			vi.useRealTimers();
		}
	});

	it("drains moves added while an earlier upload is still in flight", async () => {
		const firstUpload = deferred<{
			progress: PuzzleProgressState;
			ackedEventIds: string[];
		}>();
		syncEventsMock.mockReturnValueOnce(firstUpload.promise).mockResolvedValue({
			progress: progressWith({ guessHashes: ["one", "two"], guessCount: 2 }),
			ackedEventIds: ["two"],
		});
		const { result } = renderHook(() =>
			useDailyProgress({
				activeUser: { id: USER_ID, name: "Roger", email: "roger@example.com" },
				deviceId: "device-1",
				initialData: INITIAL_DATA,
			}),
		);
		await act(async () => {});
		const guess = (id: string): PuzzleClientEvent => ({
			id,
			at: "2026-06-11T10:00:00.000Z",
			type: "guess_added",
			payload: { guessHash: id, matchedWordId: null, unlockToken: null },
		});
		act(() => result.current.applyLocalEvent(guess("one")));
		act(() => result.current.applyLocalEvent(guess("two")));
		await act(async () =>
			firstUpload.resolve({
				progress: progressWith({ guessHashes: ["one"], guessCount: 1 }),
				ackedEventIds: ["one"],
			}),
		);
		await waitFor(() => expect(result.current.pendingEventCount).toBe(0));
		expect(syncEventsMock).toHaveBeenCalledTimes(2);
		expect(
			syncEventsMock.mock.calls[1][0].data.events.map(
				(event: PuzzleClientEvent) => event.id,
			),
		).toEqual(["two"]);
	});

	it.each(["before", "after"])(
		"keeps launch-time guesses when a stale fetch finishes %s the upload",
		async (fetchOrder) => {
			const remote = deferred<PuzzleProgressState>();
			const upload = deferred<{
				progress: PuzzleProgressState;
				ackedEventIds: string[];
			}>();
			fetchUserProgressMock.mockReturnValue(remote.promise);
			syncEventsMock.mockReturnValue(upload.promise);
			const { result } = renderHook(() =>
				useDailyProgress({
					activeUser: {
						id: USER_ID,
						name: "Roger",
						email: "roger@example.com",
					},
					deviceId: "device-1",
					initialData: INITIAL_DATA,
				}),
			);
			await act(async () => {});
			expect(fetchUserProgressMock).toHaveBeenCalledTimes(1);
			expect(result.current.isReady).toBe(true);

			act(() =>
				result.current.applyLocalEvent({
					id: "local-guess",
					at: "2026-06-11T10:00:00.000Z",
					type: "guess_added",
					payload: {
						guessHash: "local",
						matchedWordId: 1,
						unlockToken: "token-1",
					},
				}),
			);
			expect(result.current.derivedProgress.guessedWordIds).toEqual([1]);
			expect(
				getAccountPuzzleCache(USER_ID, DATE_KEY)?.queuedEvents.map(
					(event) => event.id,
				),
			).toEqual(["local-guess"]);

			const resolveFetch = () =>
				act(async () => remote.resolve(progressWith({})));
			if (fetchOrder === "before") await resolveFetch();
			expect(result.current.derivedProgress.guessedWordIds).toEqual([1]);
			expect(result.current.pendingEventCount).toBe(1);
			await act(async () =>
				upload.resolve({
					progress: progressWith({
						guessHashes: ["local", "other-device"],
						guessedWordIds: [1, 2],
						guessCount: 2,
					}),
					ackedEventIds: ["local-guess"],
				}),
			);
			if (fetchOrder === "after") await resolveFetch();
			expect(result.current.derivedProgress.guessedWordIds).toEqual([1, 2]);
			expect(result.current.pendingEventCount).toBe(0);
			expect(result.current.isReady).toBe(true);
		},
	);

	it.each(["focus", "pageshow", "online"])(
		"keeps the loaded board playable while %s starts a background refresh",
		async (eventType) => {
			const { result } = renderHook(() =>
				useDailyProgress({
					activeUser: {
						id: USER_ID,
						name: "Roger",
						email: "roger@example.com",
					},
					deviceId: "device-1",
					initialData: INITIAL_DATA,
				}),
			);
			await act(async () => {});
			fetchUserProgressMock.mockClear();
			fetchUserProgressMock.mockReturnValue(new Promise(() => {}));
			act(() => {
				window.dispatchEvent(new Event("pagehide"));
				window.dispatchEvent(new Event(eventType));
			});
			expect(fetchUserProgressMock).toHaveBeenCalledTimes(1);
			expect(result.current.isReady).toBe(true);
		},
	);

	it("ignores account progress arriving after logout", async () => {
		const fetchProgress = deferred<PuzzleProgressState>();
		fetchUserProgressMock.mockReturnValue(fetchProgress.promise);
		const { result, rerender } = renderHook(
			({ activeUser }: { activeUser: SessionUser }) =>
				useDailyProgress({
					activeUser,
					deviceId: "device-1",
					initialData: INITIAL_DATA,
				}),
			{
				initialProps: {
					activeUser: {
						id: USER_ID,
						name: "Roger",
						email: "roger@example.com",
					} as SessionUser,
				},
			},
		);
		rerender({ activeUser: null });
		await act(async () =>
			fetchProgress.resolve(
				progressWith({ guessedWordIds: [1, 2], guessCount: 3 }),
			),
		);
		expect(result.current.derivedProgress.guessedWordIds).toEqual([]);
	});

	beforeEach(() => {
		vi.stubGlobal("localStorage", createMemoryStorage());
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true })),
		);
		fetchUserProgressMock.mockReset();
		fetchUserProgressMock.mockResolvedValue(null);
		importProgressMock.mockReset();
		importProgressMock.mockResolvedValue({
			importedDates: [],
			skippedLegacyDates: [],
		});
		syncEventsMock.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("paints an anonymous player's stored progress instead of a loading state", async () => {
		saveAnonymousProgress(
			DATE_KEY,
			progressWith({ guessedWordIds: [1], guessCount: 3 }),
		);

		const rendered = renderBeforePaint(null);
		expect(rendered.paintedText).toBe("words:1");

		await rendered.settle();
		rendered.unmount();
	});

	it("reports an anonymous player's tries even with no word found", async () => {
		saveAnonymousProgress(
			DATE_KEY,
			progressWith({ guessedWordIds: [], guessCount: 3 }),
		);

		const rendered = renderBeforePaint(null);
		await rendered.settle();

		const fetchMock = window.fetch as unknown as ReturnType<typeof vi.fn>;
		const call = fetchMock.mock.calls.find(([url]) =>
			String(url).includes(`/api/leaderboard/${DATE_KEY}/anon`),
		);
		expect(call).toBeDefined();
		expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
			wordsFound: 0,
			tryCount: 3,
		});

		rendered.unmount();
	});

	it("keeps the stored progress intact while mounting", async () => {
		saveAnonymousProgress(
			DATE_KEY,
			progressWith({ guessedWordIds: [1, 2], guessCount: 5 }),
		);
		const setItem = vi.spyOn(window.localStorage, "setItem");

		const rendered = renderBeforePaint(null);
		await rendered.settle();

		const storedProgressWrites = setItem.mock.calls.filter(([key]) =>
			key.includes(DATE_KEY),
		);
		for (const [, value] of storedProgressWrites) {
			expect(value).toContain('"guessedWordIds":[1,2]');
		}

		rendered.unmount();
	});

	it("paints cached account progress before reconciling in the background", async () => {
		saveAccountPuzzleCache(USER_ID, DATE_KEY, {
			puzzleId: PUZZLE.id,
			baseProgress: progressWith({ guessedWordIds: [1], guessCount: 2 }),
			queuedEvents: [],
		});
		fetchUserProgressMock.mockResolvedValue(
			progressWith({
				guessedWordIds: [1, 2],
				guessCount: 4,
				lastSyncedAt: "2026-06-11T10:00:00.000Z",
			}),
		);

		const rendered = renderBeforePaint({
			id: USER_ID,
			name: "Roger",
			email: "roger@example.com",
		});
		expect(rendered.paintedText).toBe("words:1");

		await rendered.settle();
		expect(rendered.container.textContent).toBe("words:1,2");

		rendered.unmount();
	});

	it("resets puzzle progress and skips anonymous leaderboard reporting on logout", async () => {
		const completedProgress = progressWith({
			guessedWordIds: [1, 2],
			guessCount: 7,
			completedAt: "2026-06-11T12:00:00.000Z",
		});
		saveAccountPuzzleCache(USER_ID, DATE_KEY, {
			puzzleId: PUZZLE.id,
			baseProgress: completedProgress,
			queuedEvents: [],
		});
		fetchUserProgressMock.mockResolvedValue(completedProgress);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const signedInUser = {
			id: USER_ID,
			name: "Roger",
			email: "roger@example.com",
		};

		await act(async () => {
			root.render(<SwitchableProbe activeUser={signedInUser} />);
		});
		expect(container.textContent).toContain("words:1,2");
		expect(container.textContent).toContain(
			"completed:2026-06-11T12:00:00.000Z",
		);

		const fetchMock = window.fetch as unknown as ReturnType<typeof vi.fn>;
		fetchMock.mockClear();

		await act(async () => {
			root.render(<SwitchableProbe activeUser={null} />);
		});
		expect(container.textContent).toBe("words:;completed:none");

		const anonLeaderboardCalls = fetchMock.mock.calls.filter(([url]) =>
			String(url).includes(`/api/leaderboard/${DATE_KEY}/anon`),
		);
		expect(anonLeaderboardCalls).toHaveLength(0);
		const storedAnonProgress = window.localStorage.getItem(
			`paraules-anon-progress-v2:${DATE_KEY}`,
		);
		expect(storedAnonProgress).not.toBeNull();
		expect(JSON.parse(String(storedAnonProgress))).toMatchObject({
			guessedWordIds: [],
			guessCount: 0,
			completedAt: null,
		});

		act(() => {
			root.unmount();
		});
		container.remove();
	});
});
