// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { useGuestProgressReport } from "@/lib/use-guest-progress-report";

type Progress = Pick<PuzzleProgressState, "guessCount" | "completedAt">;

const NOT_STARTED: Progress = { guessCount: 0, completedAt: null };
const STARTED: Progress = { guessCount: 2, completedAt: null };
const FINISHED: Progress = {
	guessCount: 9,
	completedAt: "2026-10-24T10:00:00.000Z",
};

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

function renderReport(progress: Progress, userId: string | null = null) {
	return renderHook(
		(props: { progress: Progress; userId: string | null }) =>
			useGuestProgressReport({
				game: "mini",
				dateKey: "2026-10-24",
				progress: props.progress,
				userId: props.userId,
				ready: true,
			}),
		{ initialProps: { progress, userId } },
	);
}

function reportedBodies(): unknown[] {
	return fetchMock.mock.calls.map((call) => {
		const init = (call as unknown[])[1] as RequestInit;
		return JSON.parse(String(init.body));
	});
}

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	fetchMock.mockClear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("useGuestProgressReport", () => {
	it("waits for the first guess", () => {
		renderReport(NOT_STARTED);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports the start and the finish once each", () => {
		const { rerender } = renderReport(STARTED);
		rerender({ progress: { ...STARTED, guessCount: 3 }, userId: null });
		rerender({ progress: FINISHED, userId: null });
		rerender({ progress: FINISHED, userId: null });

		expect(reportedBodies()).toEqual([
			{ game: "mini", dateKey: "2026-10-24", completed: false },
			{ game: "mini", dateKey: "2026-10-24", completed: true },
		]);
	});

	it("leaves signed-in players to their progress sync", () => {
		renderReport(FINISHED, "user-1");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
