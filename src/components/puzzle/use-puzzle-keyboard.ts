import { useEffect } from "react";
import { getGuessKeyboardAction } from "@/lib/puzzle-helpers";

// The game owns unmodified typing on the page. Dialogs, editors and focused
// controls keep their native keyboard behavior. The tutorial handles its own
// keys inside its dialog and deliberately does not use this global listener.
export function usePuzzleKeyboard({
	enabled,
	letters,
	guess,
	minimumGuessLength,
	isBusy,
	onLetter,
	onBackspace,
	onSubmit,
}: {
	enabled: boolean;
	letters: string[];
	guess: string;
	minimumGuessLength: number;
	isBusy?: () => boolean;
	onLetter: (letter: string) => void;
	onBackspace: () => void;
	onSubmit: () => void;
}) {
	useEffect(() => {
		if (!enabled) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				document.querySelector(
					'[role="dialog"], [role="alertdialog"], [role="menu"]',
				)
			)
				return;
			const target = event.target;
			if (target instanceof HTMLElement) {
				if (
					target.isContentEditable ||
					target.closest(
						"input, textarea, select, [contenteditable='true'], [role='textbox']",
					)
				)
					return;
				if (
					target.closest("button, a") &&
					(event.key === "Enter" || event.key === " " || event.code === "Space")
				)
					return;
			}
			const action = getGuessKeyboardAction(event.key, letters, event.code);
			if (!action) return;
			if (
				action.type === "submit" &&
				(event.repeat || guess.trim().length < minimumGuessLength)
			)
				return;
			if (action.type === "backspace" && guess.length === 0) return;
			event.preventDefault();
			if (isBusy?.()) return;
			switch (action.type) {
				case "append_letter":
					onLetter(action.letter);
					break;
				case "backspace":
					onBackspace();
					break;
				case "submit":
					onSubmit();
					break;
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		enabled,
		letters,
		guess,
		minimumGuessLength,
		isBusy,
		onLetter,
		onBackspace,
		onSubmit,
	]);
}
