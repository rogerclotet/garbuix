import { useEffect, useState } from "react";
import {
	DEFAULT_LETTER_LAYOUT,
	getLetterLayout,
	type LetterLayout,
} from "@/lib/anon-identity";
import { useIsDesktopLayout } from "./use-is-desktop-layout";

// The letters arrangement the player chose in /preferencies, adjusted to what
// the current screen can hold.
export function useLetterLayout(): LetterLayout {
	const isDesktopLayout = useIsDesktopLayout();
	// Initialise to the default so SSR markup is deterministic, then read the
	// stored choice after mount.
	const [letterLayout, setLetterLayout] = useState<LetterLayout>(
		DEFAULT_LETTER_LAYOUT,
	);
	useEffect(() => {
		setLetterLayout(getLetterLayout());
	}, []);
	// The line only fits the phone keypad; on a desktop the keys live in a narrow
	// side column, so a seven-across row falls back to the grid.
	return letterLayout === "line" && isDesktopLayout ? "grid" : letterLayout;
}
