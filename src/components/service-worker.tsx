import { useEffect } from "react";

export function ServiceWorkerRegister() {
	useEffect(() => {
		if (!("serviceWorker" in navigator)) {
			return;
		}

		let registration: ServiceWorkerRegistration | null = null;
		let isRefreshing = false;

		const tryActivateWaiting = () => {
			if (!registration?.waiting) return;
			registration.waiting.postMessage({ type: "SKIP_WAITING" });
		};

		const onControllerChange = () => {
			if (isRefreshing) return;
			isRefreshing = true;
			window.location.reload();
		};

		const register = async () => {
			try {
				registration = await navigator.serviceWorker.register("/sw.js");
				await registration.update();

				tryActivateWaiting();

				registration.addEventListener("updatefound", () => {
					const installing = registration?.installing;
					if (!installing) return;

					installing.addEventListener("statechange", () => {
						if (
							installing.state === "installed" &&
							navigator.serviceWorker.controller
						) {
							tryActivateWaiting();
						}
					});
				});
			} catch (error) {
				console.warn("Service worker registration failed", error);
			}
		};

		const checkForUpdates = () => {
			if (registration) {
				void registration.update();
			}
		};

		navigator.serviceWorker.addEventListener(
			"controllerchange",
			onControllerChange,
		);
		void register();

		window.addEventListener("focus", checkForUpdates);
		window.addEventListener("pageshow", checkForUpdates);
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") {
				checkForUpdates();
			}
		});

		return () => {
			navigator.serviceWorker.removeEventListener(
				"controllerchange",
				onControllerChange,
			);
			window.removeEventListener("focus", checkForUpdates);
			window.removeEventListener("pageshow", checkForUpdates);
		};
	}, []);

	return null;
}
