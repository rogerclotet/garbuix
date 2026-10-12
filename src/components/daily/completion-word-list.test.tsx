// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createGuessHash } from "@/lib/puzzle-crypto";
import { CompletionWordList, useCompletionWords } from "./completion-word-list";

const PUZZLE_ID = "puzzle-1";
const LETTERS = ["c", "o", "s", "a"];
// "cosa" and "sac" sit on the board; "saco" and "oca" are valid words off it.
const REVEALED_ANSWERS = { 0: "cosa", 1: "sac" };
const OFF_BOARD_WORDS = ["saco", "oca"];

function FoundWords({
	guessHashes,
	pangramLetters,
}: {
	guessHashes: string[];
	pangramLetters?: string[];
}) {
	const query = useCompletionWords({
		puzzle: { id: PUZZLE_ID, validNormalizedGuesses: OFF_BOARD_WORDS },
		guessHashes,
		revealedAnswers: REVEALED_ANSWERS,
		enabled: true,
	});
	return <CompletionWordList query={query} pangramLetters={pangramLetters} />;
}

async function renderFoundWords(pangramLetters?: string[]) {
	const guessHashes = await Promise.all(
		OFF_BOARD_WORDS.map((word) => createGuessHash(PUZZLE_ID, word)),
	);
	render(
		<QueryClientProvider client={new QueryClient()}>
			<FoundWords guessHashes={guessHashes} pangramLetters={pangramLetters} />
		</QueryClientProvider>,
	);
}

async function findWordItem(word: string): Promise<HTMLElement> {
	const item = (await screen.findByText(word)).closest("li");
	if (!item) throw new Error(`${word} is not inside a list item`);
	return item;
}

describe("CompletionWordList pangrams", () => {
	afterEach(() => {
		cleanup();
	});

	it("colors pangrams from the board and from outside it", async () => {
		await renderFoundWords(LETTERS);

		for (const word of ["COSA", "SACO"]) {
			const item = await findWordItem(word);
			expect(item.className).toContain("text-pangram-foreground");
			expect(item.textContent).toContain(", pangrama");
		}
	});

	it("keeps the usual colors for words that miss a letter", async () => {
		await renderFoundWords(LETTERS);

		const boardWord = await findWordItem("SAC");
		expect(boardWord.className).toContain("text-primary");
		expect(boardWord.className).not.toContain("text-pangram-foreground");
		const offBoardWord = await findWordItem("OCA");
		expect(offBoardWord.className).toContain("text-muted-foreground");
		expect(offBoardWord.className).not.toContain("text-pangram-foreground");
	});

	it("colors nothing for games without letters of the day", async () => {
		await renderFoundWords();

		const item = await findWordItem("COSA");
		expect(item.className).not.toContain("text-pangram-foreground");
		expect(item.textContent).not.toContain("pangrama");
	});
});
