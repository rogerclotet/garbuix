// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TriesHistogram } from "@/components/leaderboard/tries-histogram";
import type { LeaderboardEntry } from "@/lib/leaderboard-types";

function buildEntry(
	participantId: string,
	tryCount: number,
	completed = true,
): LeaderboardEntry {
	return {
		participantId,
		kind: "user",
		name: participantId,
		image: null,
		wordsFound: completed ? 15 : 6,
		totalWords: 15,
		clueCount: 0,
		tryCount,
		completedAt: completed ? "2026-04-11T10:00:00.000Z" : null,
		updatedAt: "2026-04-11T10:00:00.000Z",
	};
}

afterEach(cleanup);

describe("TriesHistogram", () => {
	it("renders nothing until somebody finishes", () => {
		const { container } = render(
			<TriesHistogram entries={[buildEntry("a", 30, false)]} />,
		);
		expect(container.innerHTML).toBe("");
	});

	it("describes each bucket and counts only finishers", () => {
		render(
			<TriesHistogram
				entries={[
					buildEntry("a", 18),
					buildEntry("b", 22),
					buildEntry("c", 31),
					buildEntry("d", 40, false),
				]}
			/>,
		);

		expect(screen.getByText("3 han acabat")).toBeDefined();
		expect(screen.getByTitle("2 jugadors amb 15-24 intents")).toBeDefined();
		expect(screen.getByTitle("1 jugador amb 25-34 intents")).toBeDefined();
		expect(screen.getByTitle("0 jugadors amb 95+ intents")).toBeDefined();
	});

	it("names the player's own bucket instead of relying on color", () => {
		render(
			<TriesHistogram
				entries={[buildEntry("a", 18), buildEntry("b", 47)]}
				highlightTries={47}
			/>,
		);

		expect(screen.getByText(/Tu, amb 47 intents/)).toBeDefined();
	});
});
