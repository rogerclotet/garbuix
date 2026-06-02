// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ClueResponse } from "@/lib/clue-request-types";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { DailyWordList } from "./daily-word-list";

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

function renderWordList(peerCluesByWordId: Record<number, ClueResponse>) {
	return render(
		<DailyWordList
			puzzle={puzzle}
			guessedWordIds={[]}
			revealedAnswers={{}}
			cellLetters={new Map()}
			peerCluesByWordId={peerCluesByWordId}
		/>,
	);
}

describe("DailyWordList peer clues", () => {
	afterEach(() => {
		cleanup();
	});

	it("shows a received peer clue alongside the sender's name", () => {
		const response: ClueResponse = {
			requestId: "req-1",
			wordId: 0,
			text: "El que tens al teu voltant",
			responderName: "Anna",
			at: "2026-04-11T10:00:00.000Z",
		};

		renderWordList({ 0: response });

		expect(screen.getByText(response.text)).toBeTruthy();
		expect(screen.getByText("— Anna")).toBeTruthy();
	});
});
