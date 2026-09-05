// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasSeenHowToPlay } from "@/lib/puzzle-local";
import { getSlotCellKey } from "./daily-helpers";
import { HowToPlayDialog } from "./how-to-play-dialog";
import {
	TUTORIAL_BOARD,
	TUTORIAL_LETTERS,
	TUTORIAL_WORDS,
} from "./tutorial-puzzle";

function Tutorial() {
	const [open, setOpen] = useState(true);
	return (
		<>
			<HowToPlayDialog open={open} onOpenChange={setOpen} />
			<button type="button" onClick={() => setOpen(true)}>
				Reobrir
			</button>
		</>
	);
}

function typeWord(word: string) {
	const board = screen.getByRole("application", {
		name: "Tauler del tutorial",
	});
	for (const key of word) fireEvent.keyDown(board, { key });
	fireEvent.keyDown(board, { key: "Enter" });
}

beforeEach(() => {
	// Node 25 exposes a non-functional localStorage to jsdom in this test setup.
	const entries = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		get length() {
			return entries.size;
		},
		clear: () => entries.clear(),
		getItem: (key) => entries.get(key) ?? null,
		key: (index) => [...entries.keys()][index] ?? null,
		removeItem: (key) => {
			entries.delete(key);
		},
		setItem: (key, value) => {
			entries.set(key, value);
		},
	} satisfies Storage);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("guided tutorial", () => {
	it("guides the first word, requires a clue, and lets the player finish all five words", () => {
		render(<Tutorial />);
		expect(hasSeenHowToPlay()).toBe(false);
		expect(
			screen
				.getByRole("button", { name: "Pista (3)" })
				.hasAttribute("disabled"),
		).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "R" }));
		expect(screen.getByText("Ara toca la C.")).toBeTruthy();
		for (const letter of "CASA")
			fireEvent.click(screen.getByRole("button", { name: letter }));
		expect(
			screen.getByText(
				"Ja la tens! Toca la fletxa per comprovar-la o prem Enter.",
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Comprovar" }));
		expect(screen.getByText("1 / 5 paraules")).toBeTruthy();
		expect(screen.getByText("Una pista per continuar")).toBeTruthy();
		typeWord("costa");
		expect(screen.getByText("1 / 5 paraules")).toBeTruthy();
		// Keyboard / assistive-technology activation of the real clue control.
		fireEvent.click(screen.getByRole("button", { name: "Pista (3)" }), {
			detail: 0,
		});
		expect(
			screen.getByText("La part de la terra que toca el mar."),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Jugar al repte d'avui" }),
		).toBeNull();
		const hint = screen.getByRole("button", { name: "Pista (2)" });
		hint.focus();
		fireEvent.keyDown(hint, { key: "c" });
		expect(document.activeElement).toBe(screen.getByRole("application"));
		typeWord("osta");
		for (const word of ["carta", "rosa", "tros"]) typeWord(word);
		expect(screen.getByText("5 / 5 paraules")).toBeTruthy();
		expect(screen.getByText("Ja saps jugar a Garbuix!")).toBeTruthy();
		expect(hasSeenHowToPlay()).toBe(false);
		fireEvent.click(
			screen.getByRole("button", { name: "Jugar al repte d'avui" }),
		);
		expect(hasSeenHowToPlay()).toBe(true);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("skips at any step and starts a fresh practice puzzle when reopened", () => {
		render(<Tutorial />);
		typeWord("casa");
		fireEvent.click(screen.getByRole("button", { name: "Saltar el tutorial" }));
		expect(hasSeenHowToPlay()).toBe(true);
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Reobrir" }));
		expect(screen.getByText("0 / 5 paraules")).toBeTruthy();
		expect(screen.getByText("Comencem amb CASA")).toBeTruthy();
	});

	it("supports deleting and retrying guesses without counting duplicates", () => {
		render(<Tutorial />);
		const board = screen.getByRole("application");
		fireEvent.keyDown(board, { key: "c" });
		fireEvent.click(screen.getByRole("button", { name: "Esborrar" }));
		typeWord("casa");
		fireEvent.click(screen.getByRole("button", { name: "Pista (3)" }));
		typeWord("casa");
		expect(
			screen.getByText("Aquesta ja l'has trobada. Busca'n una altra!"),
		).toBeTruthy();
		typeWord("rrrr");
		expect(
			screen.getByText(
				"Aquesta paraula no és al tutorial. Prova'n una altra o demana una pista.",
			),
		).toBeTruthy();
		expect(screen.getByText("1 / 5 paraules")).toBeTruthy();
	});

	it("reveals a clue only after holding the pointer, and cancels an early release", async () => {
		vi.useFakeTimers();
		render(<Tutorial />);
		typeWord("casa");
		const hint = screen.getByRole("button", { name: "Pista (3)" });
		hint.setPointerCapture = vi.fn();
		fireEvent.pointerDown(hint, { pointerType: "touch", pointerId: 1 });
		fireEvent.pointerUp(hint);
		await vi.advanceTimersByTimeAsync(700);
		expect(
			screen.queryByText("La part de la terra que toca el mar."),
		).toBeNull();
		fireEvent.pointerDown(hint, { pointerType: "touch", pointerId: 2 });
		await vi.advanceTimersByTimeAsync(700);
		fireEvent.pointerUp(hint);
		expect(
			screen.getByText("La part de la terra que toca el mar."),
		).toBeTruthy();
	});

	it("uses five connected, compatible words made from the practice letters", () => {
		expect(TUTORIAL_WORDS).toHaveLength(5);
		const letters = new Map<string, string>();
		for (const word of TUTORIAL_WORDS) {
			let intersections = 0;
			[...word.answer].forEach((letter, index) => {
				expect(TUTORIAL_LETTERS).toContain(letter);
				const key = getSlotCellKey(word, index);
				if (letters.has(key)) expect(letters.get(key)).toBe(letter);
				letters.set(key, letter);
				const [row, col] = key.split(",").map(Number);
				if ((TUTORIAL_BOARD.gridMask[row][col]?.wordIds.length ?? 0) > 1)
					intersections++;
			});
			expect(intersections).toBeGreaterThan(0);
		}
	});
});
