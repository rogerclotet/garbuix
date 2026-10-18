import { useEffect, useState } from "react";

// The width at which the boards switch to their two-column desktop layout.
// Matches the `lg:` breakpoint those layouts are built on.
const DESKTOP_LAYOUT_QUERY = "(min-width: 1024px)";

// Starts false so the server and the first client render agree; the real value
// lands right after mount, before anything the player can act on.
export function useIsDesktopLayout(): boolean {
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
