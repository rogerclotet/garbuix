// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePuzzleKeyboard } from "./use-puzzle-keyboard";

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

function setup(
	overrides: Partial<Parameters<typeof usePuzzleKeyboard>[0]> = {},
) {
	const options = {
		enabled: true,
		letters: ["c", "o", "s", "a"],
		guess: "cosa",
		minimumGuessLength: 4,
		onLetter: vi.fn(),
		onBackspace: vi.fn(),
		onSubmit: vi.fn(),
		...overrides,
	};
	return {
		...renderHook((props) => usePuzzleKeyboard(props), {
			initialProps: options,
		}),
		options,
	};
}

function press(
	key: string,
	options: KeyboardEventInit = {},
	target: HTMLElement | Window = window,
) {
	const event = new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
		...options,
	});
	fireEvent(target, event);
	return event;
}

describe("shared puzzle keyboard", () => {
	it("maps accents, backspace and submission through the same listener", () => {
		const { options } = setup();
		expect(press("à").defaultPrevented).toBe(true);
		expect(options.onLetter).toHaveBeenCalledWith("a");
		expect(press("Backspace").defaultPrevented).toBe(true);
		expect(options.onBackspace).toHaveBeenCalledOnce();
		press("Enter");
		press(" ");
		expect(options.onSubmit).toHaveBeenCalledTimes(2);
		expect(press("z").defaultPrevented).toBe(false);
	});

	it.each([3, 4])(
		"uses the mode's minimum length of %i",
		(minimumGuessLength) => {
			const { options, rerender } = setup({
				minimumGuessLength,
				guess: "a".repeat(minimumGuessLength - 1),
			});
			expect(press("Enter").defaultPrevented).toBe(false);
			expect(options.onSubmit).not.toHaveBeenCalled();
			rerender({ ...options, guess: "a".repeat(minimumGuessLength) });
			press("Enter");
			expect(options.onSubmit).toHaveBeenCalledOnce();
		},
	);

	it("ignores held submit keys, modifiers and already handled events", () => {
		const { options } = setup();
		press("Enter", { repeat: true });
		press(" ", { repeat: true });
		for (const modifier of ["ctrlKey", "metaKey", "altKey"])
			press("a", { [modifier]: true });
		const handled = new KeyboardEvent("keydown", {
			key: "a",
			cancelable: true,
		});
		handled.preventDefault();
		fireEvent(window, handled);
		expect(options.onSubmit).not.toHaveBeenCalled();
		expect(options.onLetter).not.toHaveBeenCalled();
	});

	it.each([
		"input",
		"textarea",
		"select",
		'[contenteditable="true"]',
		'[role="textbox"]',
	])("leaves typing in %s alone", (selector) => {
		const { options } = setup();
		const editor = document.createElement(
			selector.startsWith("[") ? "div" : selector,
		);
		if (selector.includes("contenteditable"))
			editor.setAttribute("contenteditable", "true");
		if (selector.includes("textbox")) editor.setAttribute("role", "textbox");
		const child = document.createElement("span");
		editor.append(child);
		document.body.append(editor);
		expect(press("a", {}, child).defaultPrevented).toBe(false);
		press("Enter", {}, child);
		expect(options.onLetter).not.toHaveBeenCalled();
		expect(options.onSubmit).not.toHaveBeenCalled();
	});

	it.each(["dialog", "alertdialog", "menu"])(
		"suspends the board while a %s is open",
		(role) => {
			const { options } = setup();
			const overlay = document.createElement("div");
			overlay.setAttribute("role", role);
			document.body.append(overlay);
			expect(press("a").defaultPrevented).toBe(false);
			press("Enter");
			expect(options.onLetter).not.toHaveBeenCalled();
			expect(options.onSubmit).not.toHaveBeenCalled();
			overlay.remove();
			press("a");
			expect(options.onLetter).toHaveBeenCalledOnce();
		},
	);

	it.each(["letter", "hint", "shuffle", "link"])(
		"preserves native activation of a focused %s control",
		(kind) => {
			const { options } = setup();
			const control = document.createElement(kind === "link" ? "a" : "button");
			control.setAttribute("tabindex", "0");
			const label = document.createElement("span");
			control.append(label);
			document.body.append(control);
			control.focus();
			expect(press("Enter", {}, label).defaultPrevented).toBe(false);
			expect(press(" ", { code: "Space" }, label).defaultPrevented).toBe(false);
			expect(options.onSubmit).not.toHaveBeenCalled();
			press("a", {}, label);
			expect(options.onLetter).toHaveBeenCalledWith("a");
		},
	);

	it("stops input when disabled or busy, and cleans up on unmount", () => {
		let busy = false;
		const { options, rerender, unmount } = setup({ isBusy: () => busy });
		busy = true;
		press("a");
		press("Enter");
		press("Backspace");
		expect(options.onLetter).not.toHaveBeenCalled();
		expect(options.onSubmit).not.toHaveBeenCalled();
		expect(options.onBackspace).not.toHaveBeenCalled();
		busy = false;
		rerender({ ...options, enabled: false });
		expect(press("a").defaultPrevented).toBe(false);
		rerender(options);
		press("a");
		expect(options.onLetter).toHaveBeenCalledOnce();
		unmount();
		expect(press("a").defaultPrevented).toBe(false);
		expect(options.onLetter).toHaveBeenCalledOnce();
	});

	it("leaves backspace alone when the guess is empty", () => {
		const { options } = setup({ guess: "" });
		expect(press("Backspace").defaultPrevented).toBe(false);
		expect(options.onBackspace).not.toHaveBeenCalled();
	});
});
