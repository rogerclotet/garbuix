import { useEffect, useState } from "react";
import {
	DEFAULT_LETTER_LAYOUT,
	getLetterLayout,
	type LetterLayout,
} from "@/lib/anon-identity";

// The width at which the classic board switches to its two-column desktop
// layout, where the keypad lives in a narrow side column. Matches the `lg:`
// breakpoint the classic layout is built on.
const DESKTOP_LAYOUT_QUERY = "(min-width: 1024px)";

// Starts false so the server and the first client render agree; the real value
// lands right after mount, before anything the player can act on.
function useIsDesktopLayout(): boolean {
	const [isDesktop, setIsDesktop] = useState(false);

	useEffect(() => {
		if (typeof window.matchMedia !== "function") {
			return;
		}

		const mediaQuery = window.matchMedia(DESKTOP_LAYOUT_QUERY);
		const update = () => setIsDesktop(mediaQuery.matches);

		update();
		mediaQuery.addEventListener("change", update);
		return () => mediaQuery.removeEventListener("change", update);
	}, []);

	return isDesktop;
}

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
