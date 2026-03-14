import { useEffect } from "react";

type NavigatorWithStandalone = Navigator & {
	standalone?: boolean;
};

type LockableOrientation =
	| "any"
	| "natural"
	| "landscape"
	| "portrait"
	| "portrait-primary"
	| "portrait-secondary"
	| "landscape-primary"
	| "landscape-secondary";

type ScreenOrientationWithLock = ScreenOrientation & {
	lock?: (orientation: LockableOrientation) => Promise<void>;
};

function isStandaloneDisplayMode() {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		Boolean((navigator as NavigatorWithStandalone).standalone)
	);
}

async function lockPortraitOrientation() {
	if (!isStandaloneDisplayMode()) {
		return;
	}

	const orientation = screen.orientation as ScreenOrientationWithLock;

	if (typeof orientation?.lock !== "function") {
		return;
	}

	try {
		await orientation.lock("portrait-primary");
	} catch (error) {
		if (import.meta.env.DEV) {
			console.warn("Unable to lock screen orientation to portrait.", error);
		}
	}
}

export function OrientationLock() {
	useEffect(() => {
		void lockPortraitOrientation();

		const relock = () => {
			void lockPortraitOrientation();
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				relock();
			}
		};

		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pageshow", relock);
		screen.orientation?.addEventListener?.("change", relock);

		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pageshow", relock);
			screen.orientation?.removeEventListener?.("change", relock);
		};
	}, []);

	return null;
}
