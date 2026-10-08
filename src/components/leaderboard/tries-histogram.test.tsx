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
	it("renders nothing until somebody plays", () => {
		const { container } = render(<TriesHistogram entries={[]} />);
		expect(container.innerHTML).toBe("");
	});

	it("shows players still playing before anybody finishes", () => {
		render(<TriesHistogram entries={[buildEntry("a", 30, false)]} />);

		expect(screen.getByText("0 han acabat · 1 encara juga")).toBeDefined();
		expect(screen.getByTitle("25-34 intents: 1 encara juga")).toBeDefined();
		expect(screen.getByText("Encara jugant")).toBeDefined();
		expect(screen.queryByText("Han acabat")).toBeNull();
	});

	it("names both bar colors once finished and playing players are mixed", () => {
		render(
			<TriesHistogram
				entries={[buildEntry("a", 18), buildEntry("b", 30, false)]}
			/>,
		);

		expect(screen.getByText("Han acabat")).toBeDefined();
		expect(screen.getByText("Encara jugant")).toBeDefined();
	});

	it("describes each bucket, counting finished and playing players apart", () => {
		render(
			<TriesHistogram
				entries={[
					buildEntry("a", 18),
					buildEntry("b", 22),
					buildEntry("c", 31),
					buildEntry("d", 40, false),
					buildEntry("e", 20, false),
				]}
			/>,
		);

		expect(screen.getByText("3 han acabat · 2 encara juguen")).toBeDefined();
		expect(
			screen.getByTitle("15-24 intents: 2 han acabat, 1 encara juga"),
		).toBeDefined();
		expect(screen.getByTitle("25-34 intents: 1 ha acabat")).toBeDefined();
		expect(screen.getByTitle("35-44 intents: 1 encara juga")).toBeDefined();
		expect(screen.getByTitle("95+ intents: ningú")).toBeDefined();
	});

	it("shows the player's own result before the leaderboard echoes it back", () => {
		render(
			<TriesHistogram
				entries={[buildEntry("other", 18)]}
				highlightTries={26}
				selfParticipantId="me"
			/>,
		);

		expect(screen.getByText("2 han acabat")).toBeDefined();
		expect(screen.getByTitle("25-34 intents: 1 ha acabat")).toBeDefined();
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
