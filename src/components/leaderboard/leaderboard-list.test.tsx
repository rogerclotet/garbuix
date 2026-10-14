// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import type { LeaderboardEntry } from "@/lib/leaderboard-types";

function buildEntries(count: number): LeaderboardEntry[] {
	return Array.from({ length: count }, (_, index) => ({
		participantId: `user:${index + 1}`,
		kind: "user",
		name: `Jugador ${index + 1}`,
		image: null,
		wordsFound: 15 - index,
		totalWords: 15,
		clueCount: 0,
		tryCount: 10,
		completedAt: null,
		updatedAt: "2026-04-11T10:00:00.000Z",
	}));
}

function visibleRanks(): string[] {
	return screen
		.getAllByRole("listitem")
		.map((row) => row.querySelector("span")?.textContent ?? "");
}

afterEach(cleanup);

describe("LeaderboardList", () => {
	it("shows every row without a collapsed count", () => {
		render(<LeaderboardList entries={buildEntries(12)} />);

		expect(screen.getAllByRole("listitem")).toHaveLength(12);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("shows every row when they fit in the collapsed count", () => {
		render(<LeaderboardList entries={buildEntries(10)} collapsedCount={10} />);

		expect(screen.getAllByRole("listitem")).toHaveLength(10);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("shows the top rows until the reader expands the list", () => {
		render(<LeaderboardList entries={buildEntries(12)} collapsedCount={10} />);

		expect(visibleRanks()).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"10",
		]);

		fireEvent.click(screen.getByRole("button", { name: "Mostra'n més" }));

		expect(screen.getAllByRole("listitem")).toHaveLength(12);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("keeps the reader's own row in the last slot when they rank below the cut", () => {
		render(
			<LeaderboardList
				entries={buildEntries(30)}
				localParticipantId="user:23"
				collapsedCount={10}
			/>,
		);

		expect(visibleRanks()).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"23",
		]);
		const ownRow = screen.getAllByRole("listitem").at(-1);
		expect(ownRow?.getAttribute("aria-current")).toBe("true");
		expect(ownRow?.textContent).toContain("Jugador 23");
	});

	it("leaves the top rows alone when the reader is already in them", () => {
		render(
			<LeaderboardList
				entries={buildEntries(30)}
				localParticipantId="user:4"
				collapsedCount={10}
			/>,
		);

		expect(visibleRanks()).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"10",
		]);
	});
});
