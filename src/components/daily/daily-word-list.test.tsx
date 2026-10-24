// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ClueHelpGiven,
	ClueRequest,
	ClueResponse,
} from "@/lib/clue-request-types";
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

function renderFoundWord(pangramWordIds: number[]) {
	return render(
		<DailyWordList
			puzzle={puzzle}
			guessedWordIds={[0]}
			revealedAnswers={{ 0: "cosa" }}
			cellLetters={new Map()}
			pangramWordIds={pangramWordIds}
		/>,
	);
}

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

describe("DailyWordList pangram", () => {
	afterEach(() => {
		cleanup();
	});

	it("marks a found word that uses every letter", () => {
		renderFoundWord([0]);

		expect(
			screen.getByTitle("Pangrama: fa servir totes les lletres"),
		).toBeTruthy();
	});

	it("leaves other found words unmarked", () => {
		renderFoundWord([]);

		expect(screen.getByText("COSA")).toBeTruthy();
		expect(screen.queryByTitle(/Pangrama/)).toBeNull();
	});
});

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
		expect(screen.getByText("Pista de Anna")).toBeTruthy();
	});
});

describe("DailyWordList helping other players", () => {
	afterEach(() => {
		cleanup();
	});

	const request: ClueRequest = {
		id: "req-marta",
		dateKey: "2026-04-11",
		puzzleId: "puzzle-1",
		wordId: 0,
		wordLength: 4,
		requesterId: "marta",
		requesterName: "Marta",
		createdAt: "2026-04-11T10:00:00.000Z",
		requesterHasAiClue: false,
	};
	const helpedAnna: ClueHelpGiven = {
		requesterId: "anna",
		requesterName: "Anna",
		wordId: 0,
		at: "2026-04-11T09:00:00.000Z",
		text: "Una qualsevol",
	};

	it("offers the word's clue and the hints already sent for it", () => {
		const onRespondToClue = vi.fn(async () => ({ ok: true as const }));
		render(
			<DailyWordList
				puzzle={puzzle}
				guessedWordIds={[0]}
				revealedAnswers={{ 0: "cosa" }}
				cellLetters={new Map()}
				foundClueTextsByWordId={{ 0: "Element indeterminat." }}
				incomingRequests={[request]}
				helpGivenRecords={[helpedAnna]}
				onRespondToClue={onRespondToClue}
			/>,
		);

		expect(screen.getByText("Has ajudat Anna")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Ajuda Marta" }));
		expect(screen.getByRole("button", { name: "Copia la pista" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Una qualsevol" }));
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
		expect(onRespondToClue).toHaveBeenCalledWith("req-marta", "Una qualsevol");
	});
});
