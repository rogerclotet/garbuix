// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushGuestProgressReports } from "@/lib/guest-progress-outbox";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { useGuestProgressReport } from "@/lib/use-guest-progress-report";

type Progress = Pick<PuzzleProgressState, "guessCount" | "completedAt">;

const TODAY = "2026-10-24";
const OUTBOX_KEY = "paraules-guest-progress-outbox-v1";
const NOT_STARTED: Progress = { guessCount: 0, completedAt: null };
const STARTED: Progress = { guessCount: 2, completedAt: null };
const FINISHED: Progress = {
	guessCount: 9,
	completedAt: "2026-10-24T10:00:00.000Z",
};

const fetchMock = vi.fn(
	async (_url: string, _init: RequestInit) =>
		new Response(null, { status: 204 }),
);

function renderReport(progress: Progress, userId: string | null = null) {
	return renderHook(
		(props: { progress: Progress; userId: string | null }) =>
			useGuestProgressReport({
				game: "mini",
				dateKey: TODAY,
				progress: props.progress,
				userId: props.userId,
				ready: true,
			}),
		{ initialProps: { progress, userId } },
	);
}

function sentBodies(): unknown[] {
	return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
}

function outbox(): unknown {
	return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
}

beforeEach(() => {
	// Noon in Madrid, so "today" and "yesterday" are fixed.
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-10-24T10:00:00.000Z"));
	vi.stubGlobal("fetch", fetchMock);
	fetchMock.mockReset();
	fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
	localStorage.clear();
});

afterEach(async () => {
	cleanup();
	await flushGuestProgressReports();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("useGuestProgressReport", () => {
	it("waits for the first guess", async () => {
		renderReport(NOT_STARTED);
		await flushGuestProgressReports();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports the start and the finish once each", async () => {
		const { rerender } = renderReport(STARTED);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		rerender({ progress: { ...STARTED, guessCount: 3 }, userId: null });
		rerender({ progress: FINISHED, userId: null });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		rerender({ progress: FINISHED, userId: null });
		await flushGuestProgressReports();

		expect(sentBodies()).toEqual([
			{ game: "mini", dateKey: TODAY, completed: false },
			{ game: "mini", dateKey: TODAY, completed: true },
		]);
		expect(outbox()).toEqual([]);
	});

	it("leaves signed-in players to their progress sync", async () => {
		renderReport(FINISHED, "user-1");
		await flushGuestProgressReports();

		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("offline", () => {
	it("keeps a finish made offline and sends it once back online", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
		renderReport(FINISHED);
		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		await flushGuestProgressReports();
		expect(outbox()).toEqual([
			{ game: "mini", dateKey: TODAY, completed: true },
		]);

		fetchMock.mockImplementation(
			async () => new Response(null, { status: 204 }),
		);
		await act(async () => {
			window.dispatchEvent(new Event("online"));
			await flushGuestProgressReports();
		});

		expect(outbox()).toEqual([]);
		expect(sentBodies().at(-1)).toEqual({
			game: "mini",
			dateKey: TODAY,
			completed: true,
		});
	});

	it("sends what waited from an earlier visit when a game opens", async () => {
		localStorage.setItem(
			OUTBOX_KEY,
			JSON.stringify([
				{ game: "quadrat", dateKey: "2026-10-23", completed: true },
				{ game: "mini", dateKey: "2026-10-20", completed: true },
			]),
		);

		renderReport(NOT_STARTED);
		await waitFor(() => expect(outbox()).toEqual([]));

		// Yesterday still counts; anything older is dropped unsent.
		expect(sentBodies()).toEqual([
			{ game: "quadrat", dateKey: "2026-10-23", completed: true },
		]);
	});

	it("turns a queued start into a finish", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
		const { rerender } = renderReport(STARTED);
		await waitFor(() =>
			expect(outbox()).toEqual([
				{ game: "mini", dateKey: TODAY, completed: false },
			]),
		);

		rerender({ progress: FINISHED, userId: null });
		await flushGuestProgressReports();

		expect(outbox()).toEqual([
			{ game: "mini", dateKey: TODAY, completed: true },
		]);
	});

	it("doesn't retry a report the server answered with an error", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
		renderReport(STARTED);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await flushGuestProgressReports();

		expect(outbox()).toEqual([]);
	});
});
