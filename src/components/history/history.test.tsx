// @vitest-environment jsdom

import { act } from "@testing-library/react";
import type { ComponentProps } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { HistoryView } from "./history";

vi.mock("@/lib/puzzle-server-fns", () => ({}));

const NativeDateTimeFormat = Intl.DateTimeFormat;

function setDefaultTimeZone(timeZone: string) {
	// Use the real formatter with a different runtime default, including when
	// application code calls it as a constructor.
	function createFormatter(
		locales?: Intl.LocalesArgument,
		options?: Intl.DateTimeFormatOptions,
	) {
		return new NativeDateTimeFormat(locales, { timeZone, ...options });
	}
	vi.spyOn(Intl, "DateTimeFormat").mockImplementation(createFormatter);
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

it.each([false, true])(
	"hydrates history dates across server and browser time zones, mini=%s",
	async (mini) => {
		const props: ComponentProps<typeof HistoryView> = {
			mini,
			entries: [
				{
					dateKey: "2026-10-03",
					seed: null,
					totalWords: 1,
					guessedWords: 1,
					guessCount: 1,
					hintsUsed: 0,
					completed: true,
					lastUpdated: "2026-10-03T12:00:00Z",
				},
			],
			stats: {
				totalDays: 1,
				completedDays: 1,
				currentStreak: 1,
				bestStreak: 1,
				avgGuesses: 1,
				cluesGiven: 0,
			},
			yesterdayPuzzle: {
				dateKey: "2026-10-03",
				preview: { rows: 1, cols: 1, gridLetters: [["a"]], wordSlots: [] },
			},
			hasMore: false,
			isLoadingMore: false,
			onLoadMore: () => {},
		};
		setDefaultTimeZone("UTC");
		const { HistoryView: ServerHistory } = await import("./history");
		const container = document.createElement("div");
		container.innerHTML = renderToString(<ServerHistory {...props} />);
		const serverText = container.textContent;
		expect(serverText).toContain("3 d’octubre del 2026");

		vi.resetModules();
		setDefaultTimeZone("Pacific/Kiritimati");
		const { HistoryView: ClientHistory } = await import("./history");
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, <ClientHistory {...props} />, {
			onRecoverableError,
		});
		try {
			await act(async () => {});
			expect(onRecoverableError).not.toHaveBeenCalled();
			expect(container.textContent).toBe(serverText);
		} finally {
			await act(async () => root.unmount());
		}
	},
);

it("marks the middle dot between the cells of yesterday's solution", async () => {
	const { HistoryView } = await import("./history");
	const container = document.createElement("div");
	container.innerHTML = renderToString(
		<HistoryView
			entries={[]}
			stats={{
				totalDays: 0,
				completedDays: 0,
				currentStreak: 0,
				bestStreak: 0,
				avgGuesses: 0,
				cluesGiven: 0,
			}}
			yesterdayPuzzle={{
				dateKey: "2026-10-03",
				preview: {
					rows: 1,
					cols: 5,
					gridLetters: [Array.from("colla")],
					wordSlots: [
						{
							id: 0,
							startRow: 0,
							startCol: 0,
							direction: "horizontal",
							length: 5,
							middleDotAfterIndices: [2],
						},
					],
				},
			}}
			hasMore={false}
			isLoadingMore={false}
			onLoadMore={() => {}}
		/>,
	);

	const cells = [...container.querySelectorAll("[data-cell-key]")];
	expect(cells.map((cell) => cell.textContent)).toEqual([
		"C",
		"O",
		"L·",
		"L",
		"A",
	]);
});
