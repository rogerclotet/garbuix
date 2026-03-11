import { useEffect } from "react";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/app-version";

const UPDATE_TOAST_ID = "app-update-available";
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

type VersionManifest = {
	version: string;
};

function getServiceWorkerUrl(version: string) {
	return `/sw.js?v=${encodeURIComponent(version)}`;
}

async function fetchLatestVersion() {
	const response = await fetch(`/version.json?ts=${Date.now()}`, {
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(`Version check failed with status ${response.status}`);
	}

	const manifest = (await response.json()) as Partial<VersionManifest>;
	return typeof manifest.version === "string" ? manifest.version : null;
}

function waitForWaitingWorker(registration: ServiceWorkerRegistration) {
	return new Promise<ServiceWorker | null>((resolve, reject) => {
		if (registration.waiting) {
			resolve(registration.waiting);
			return;
		}

		let timeoutId = 0;
		let installingCleanup: (() => void) | null = null;

		const cleanup = () => {
			window.clearTimeout(timeoutId);
			registration.removeEventListener("updatefound", onUpdateFound);
			installingCleanup?.();
			installingCleanup = null;
		};

		const onStateChange = (worker: ServiceWorker) => {
			if (worker.state === "installed") {
				cleanup();
				resolve(registration.waiting ?? worker);
				return;
			}

			if (worker.state === "redundant") {
				cleanup();
				reject(new Error("Service worker installation became redundant"));
			}
		};

		const watchInstallingWorker = (worker: ServiceWorker | null) => {
			if (!worker) {
				return;
			}

			installingCleanup?.();
			const handleStateChange = () => onStateChange(worker);
			worker.addEventListener("statechange", handleStateChange);
			installingCleanup = () => {
				worker.removeEventListener("statechange", handleStateChange);
			};
			handleStateChange();
		};

		const onUpdateFound = () => {
			watchInstallingWorker(registration.installing);
		};

		registration.addEventListener("updatefound", onUpdateFound);
		onUpdateFound();

		timeoutId = window.setTimeout(() => {
			cleanup();
			resolve(registration.waiting ?? null);
		}, 10_000);
	});
}

export function ServiceWorkerRegister() {
	useEffect(() => {
		if (import.meta.env.DEV || !("serviceWorker" in navigator)) {
			return;
		}

		let registration: ServiceWorkerRegistration | null = null;
		let cleanupRegistrationListeners: (() => void) | null = null;
		let shouldReloadOnControllerChange = false;
		let isCheckingForUpdates = false;
		let latestVersion = APP_VERSION;
		let updateToastVisible = false;

		const resetUpdateToast = () => {
			updateToastVisible = false;
		};

		const showUpdateToast = () => {
			if (updateToastVisible) {
				return;
			}

			updateToastVisible = true;
			toast.info("Hi ha una nova versió disponible.", {
				id: UPDATE_TOAST_ID,
				duration: Number.POSITIVE_INFINITY,
				action: {
					label: "Actualitza",
					onClick: () => {
						void activateUpdate();
					},
				},
				cancel: {
					label: "Més tard",
					onClick: resetUpdateToast,
				},
				onDismiss: resetUpdateToast,
			});
		};

		const onControllerChange = () => {
			if (!shouldReloadOnControllerChange) {
				return;
			}

			shouldReloadOnControllerChange = false;
			window.location.reload();
		};

		const observeRegistration = (
			nextRegistration: ServiceWorkerRegistration,
		) => {
			const installingListeners = new Map<ServiceWorker, () => void>();

			const watchInstallingWorker = (worker: ServiceWorker | null) => {
				if (!worker || installingListeners.has(worker)) {
					return;
				}

				const onStateChange = () => {
					if (
						worker.state === "installed" &&
						navigator.serviceWorker.controller
					) {
						showUpdateToast();
					}
				};

				worker.addEventListener("statechange", onStateChange);
				installingListeners.set(worker, () => {
					worker.removeEventListener("statechange", onStateChange);
				});
				onStateChange();
			};

			const onUpdateFound = () => {
				watchInstallingWorker(nextRegistration.installing);
			};

			nextRegistration.addEventListener("updatefound", onUpdateFound);
			onUpdateFound();

			if (nextRegistration.waiting && navigator.serviceWorker.controller) {
				showUpdateToast();
			}

			return () => {
				nextRegistration.removeEventListener("updatefound", onUpdateFound);
				for (const dispose of installingListeners.values()) {
					dispose();
				}
			};
		};

		const setRegistration = (
			nextRegistration: ServiceWorkerRegistration | null,
		) => {
			cleanupRegistrationListeners?.();
			cleanupRegistrationListeners = null;
			registration = nextRegistration;

			if (registration) {
				cleanupRegistrationListeners = observeRegistration(registration);
			}
		};

		const registerVersion = async (version: string) => {
			const nextRegistration = await navigator.serviceWorker.register(
				getServiceWorkerUrl(version),
			);
			setRegistration(nextRegistration);
			return nextRegistration;
		};

		const prepareUpdate = async (version: string) => {
			const nextRegistration = await registerVersion(version);
			await nextRegistration.update();
			await waitForWaitingWorker(nextRegistration).catch((error) => {
				console.warn("Service worker update preparation failed", error);
				return null;
			});
			return nextRegistration;
		};

		const activateUpdate = async () => {
			try {
				const nextRegistration = await prepareUpdate(latestVersion);
				const waitingWorker = nextRegistration.waiting;

				if (waitingWorker) {
					shouldReloadOnControllerChange = true;
					toast.dismiss(UPDATE_TOAST_ID);
					waitingWorker.postMessage({ type: "SKIP_WAITING" });
					return;
				}

				window.location.reload();
			} catch (error) {
				console.warn("Failed to activate updated service worker", error);
				resetUpdateToast();
				toast.error("No s'ha pogut actualitzar l'aplicacio.");
			}
		};

		const checkForUpdates = async () => {
			if (isCheckingForUpdates) {
				return;
			}

			isCheckingForUpdates = true;

			try {
				registration ??= await registerVersion(APP_VERSION);
				await registration.update();

				const nextVersion = await fetchLatestVersion();
				if (!nextVersion || nextVersion === APP_VERSION) {
					return;
				}

				latestVersion = nextVersion;
				showUpdateToast();
				await prepareUpdate(nextVersion);
			} catch (error) {
				console.warn("Service worker update check failed", error);
			} finally {
				isCheckingForUpdates = false;
			}
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void checkForUpdates();
			}
		};

		const onWindowFocus = () => {
			void checkForUpdates();
		};

		const onPageShow = () => {
			void checkForUpdates();
		};

		navigator.serviceWorker.addEventListener(
			"controllerchange",
			onControllerChange,
		);
		void checkForUpdates();

		window.addEventListener("focus", onWindowFocus);
		window.addEventListener("pageshow", onPageShow);
		document.addEventListener("visibilitychange", onVisibilityChange);
		const intervalId = window.setInterval(() => {
			void checkForUpdates();
		}, UPDATE_CHECK_INTERVAL_MS);

		return () => {
			toast.dismiss(UPDATE_TOAST_ID);
			resetUpdateToast();
			window.clearInterval(intervalId);
			cleanupRegistrationListeners?.();
			navigator.serviceWorker.removeEventListener(
				"controllerchange",
				onControllerChange,
			);
			window.removeEventListener("focus", onWindowFocus);
			window.removeEventListener("pageshow", onPageShow);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, []);

	return null;
}
