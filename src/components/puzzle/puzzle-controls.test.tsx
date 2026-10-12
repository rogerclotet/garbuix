// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PuzzleControls } from "./puzzle-controls";

const noop = () => {};

function renderControls(
	props: Pick<
		ComponentProps<typeof PuzzleControls>,
		"layout" | "shuffledLetters" | "onHeightChange"
	>,
) {
	render(
		<PuzzleControls
			aiClueMode={false}
			canUseHint
			currentGuess=""
			hintsUsed={0}
			isComplete={false}
			onBackspace={noop}
			onHint={noop}
			onLetterClick={noop}
			onShuffle={noop}
			onSubmitGuess={noop}
			submitFeedback={null}
			runClickAction={noop}
			runPressAction={noop}
			{...props}
		/>,
	);
}

function getLetterKeys(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot=letter-key]")];
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("PuzzleControls letter grid", () => {
	it("keeps six letters in three columns with the submit beside them", () => {
		renderControls({ layout: "grid", shuffledLetters: [..."abcdef"] });

		const grid = getLetterKeys()[0]?.parentElement;
		const submit = screen.getByRole("button", { name: "Comprovar" });

		expect(grid?.className).toContain("grid-cols-3");
		expect(grid?.children).toHaveLength(6);
		expect(grid?.contains(submit)).toBe(false);
	});

	it("puts seven letters in four columns and closes the grid with the submit", () => {
		renderControls({ layout: "grid", shuffledLetters: [..."abcdefg"] });

		const grid = getLetterKeys()[0]?.parentElement;
		const submit = screen.getByRole("button", { name: "Comprovar" });

		expect(getLetterKeys()).toHaveLength(7);
		expect(grid?.className).toContain("grid-cols-4");
		expect(grid?.children).toHaveLength(8);
		expect(grid?.lastElementChild).toBe(submit);
	});
});

describe("PuzzleControls letter wheel", () => {
	function getWheel(): HTMLElement {
		const wheel = getLetterKeys()[0]?.parentElement?.parentElement;
		if (!wheel) {
			throw new Error("Expected the letter wheel to be rendered");
		}
		return wheel;
	}

	it("keeps six letters at full size", () => {
		renderControls({ layout: "circle", shuffledLetters: [..."abcdef"] });

		expect(getWheel().style.getPropertyValue("--circle-key")).toContain(
			"* 1.0000)",
		);
	});

	it("shrinks seven letters so the wheel keeps its footprint", () => {
		renderControls({ layout: "circle", shuffledLetters: [..."abcdefg"] });

		expect(getWheel().style.getPropertyValue("--circle-key")).toContain(
			"* 0.9029)",
		);
	});
});

describe("PuzzleControls height", () => {
	it("reports its height on mount without waiting for the resize observer", () => {
		// An observer that never answers stands in for the browser's, which
		// delivers its first entry only after the page has painted.
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 225,
		} as DOMRect);
		const onHeightChange = vi.fn();

		renderControls({
			layout: "grid",
			shuffledLetters: [..."abcdef"],
			onHeightChange,
		});

		expect(onHeightChange).toHaveBeenCalledWith(225);
	});
});
