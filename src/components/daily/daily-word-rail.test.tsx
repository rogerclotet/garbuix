// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getOptimotDefinitionUrl } from "./daily-helpers";
import { DailyWordRail } from "./daily-word-rail";

const puzzle: DailyPuzzlePublic = {
	id: "puzzle-1",
	dateKey: "2026-04-11",
	seed: 260411,
	algorithmVersion: "1",
	rows: 1,
	cols: 4,
	gridMask: [
		[{ wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }, { wordIds: [0] }],
	],
	letters: ["c", "o", "s", "a"],
	initialShuffledLetters: ["c", "o", "s", "a"],
	validNormalizedGuesses: ["cosa"],
	wordSlots: [
		{
			id: 0,
			startRow: 0,
			startCol: 0,
			direction: "horizontal",
			length: 4,
			slotSalt: "slot-0",
			answerHash: "hash-0",
			answerCapsule: "capsule-0",
		},
	],
	hintCapsules: [],
};

function RailHarness({
	guessedWordIds = [],
	revealedAnswers = {},
	foundClueTextsByWordId = {},
}: {
	guessedWordIds?: number[];
	revealedAnswers?: Record<number, string>;
	foundClueTextsByWordId?: Record<number, string>;
}) {
	const [openWordId, setOpenWordId] = useState<number | null>(null);

	return (
		<DailyWordRail
			puzzle={puzzle}
			guessedWordIds={guessedWordIds}
			revealedAnswers={revealedAnswers}
			cellLetters={new Map()}
			foundClueTextsByWordId={foundClueTextsByWordId}
			openWordId={openWordId}
			onOpenWordChange={setOpenWordId}
		/>
	);
}

describe("DailyWordRail found words", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
	});

	it("opens the panel with the clue and an Optimot definition link", () => {
		const clue = "Allò que et rodeja";
		render(
			<RailHarness
				guessedWordIds={[0]}
				revealedAnswers={{ 0: "cosa" }}
				foundClueTextsByWordId={{ 0: clue }}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /COSA/ }));

		expect(screen.getByText(clue)).toBeTruthy();
		const definitionLink = screen.getByRole("link", {
			name: "Veure definició a Optimot",
		});
		expect(definitionLink.getAttribute("href")).toBe(
			getOptimotDefinitionUrl("cosa"),
		);
		expect(definitionLink.getAttribute("target")).toBe("_blank");
	});
});
