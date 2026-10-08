import { RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { prepareAppReload } from "@/lib/app-reload";
import { APP_RELEASE, APP_SERVICE_WORKER_VERSION } from "@/lib/app-version";

const UPDATE_TOAST_ID = "app-update-available";
const RELOAD_TARGET_KEY = "app-update-reload-target";
const RELOAD_TIME_KEY = "app-update-reload-time";
const RELOAD_COOLDOWN_MS = 60_000;

const versionManifestSchema = z.object({
	serviceWorkerVersion: z.string().min(1),
	sentryRelease: z.string().min(1),
});

function getServiceWorkerUrl(version: string) {
	return `/sw.js?v=${encodeURIComponent(version)}`;
}

// Navigations are network-first, so the running bundle is already current while
// the worker that served it, and the precache it serves without revalidation,
// can still be an older one. Compare against the worker actually in control:
// against the bundle's own version, a precache-only change such as a new
// manifest would never install its worker.
function getActiveWorkerVersion(
	registration: ServiceWorkerRegistration | null,
): string | null {
	const scriptURL = registration?.active?.scriptURL;
	if (!scriptURL) return APP_SERVICE_WORKER_VERSION;
	return new URL(scriptURL).searchParams.get("v");
}

async function fetchLatestVersion(signal: AbortSignal) {
	const response = await fetch(`/version.json?ts=${Date.now()}`, {
		cache: "no-store",
		signal,
	});
	if (!response.ok) {
		throw new Error(`Version check failed with status ${response.status}`);
	}
	return versionManifestSchema.parse(await response.json());
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

		timeoutId = window.setTimeout(() => {
			cleanup();
			resolve(registration.waiting ?? null);
		}, 10_000);
		registration.addEventListener("updatefound", onUpdateFound);
		onUpdateFound();
	});
}

export function ServiceWorkerRegister() {
	useEffect(() => {
		if (import.meta.env.DEV) {
			if (!("serviceWorker" in navigator)) return;
			void (async () => {
				const registrations = await navigator.serviceWorker.getRegistrations();
				if (registrations.length === 0) {
					return;
				}
				await Promise.all(registrations.map((r) => r.unregister()));
				if ("caches" in window) {
					const keys = await caches.keys();
					await Promise.all(keys.map((key) => caches.delete(key)));
				}
				window.location.reload();
			})();
			return;
		}

		let registration: ServiceWorkerRegistration | null = null;
		let cleanupRegistrationListeners: (() => void) | null = null;
		const workers =
			"serviceWorker" in navigator ? navigator.serviceWorker : null;
		let versionRequest: AbortController | null = null;
		let disposed = false;
		let reloadRequested = false;
		let pendingReload: (() => void) | null = null;
		let activationTimeout = 0;
		let isActivating = false;
		let interactionRevision = 0;
		let wasBackgrounded = document.visibilityState === "hidden";
		let pendingReturnRevision: number | null = null;
		let isCheckingForUpdates = false;
		let latestVersion = {
			serviceWorkerVersion: APP_SERVICE_WORKER_VERSION,
			sentryRelease: APP_RELEASE,
		};
		let updateToastVisible = false;

		const resetUpdateToast = () => {
			updateToastVisible = false;
		};

		const showUpdateToast = () => {
			if (disposed || reloadRequested || updateToastVisible || isActivating) {
				return;
			}

			updateToastVisible = true;
			toast.custom(
				(id) => (
					<div className="w-full rounded-xl border border-border bg-popover text-popover-foreground shadow-lg p-4 font-ui">
						<div className="flex items-start gap-3">
							<div className="flex-1 min-w-0">
								<p className="text-sm font-semibold leading-tight">
									Nova versió disponible
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Actualitza per obtenir les últimes millores.
								</p>
							</div>
							<button
								type="button"
								className="shrink-0 -mt-1 -mr-1 p-1 rounded-md text-muted-foreground/60 hover:text-muted-foreground transition-colors"
								onClick={() => {
									toast.dismiss(id);
									resetUpdateToast();
								}}
							>
								<X className="w-4 h-4" />
							</button>
						</div>
						<div className="flex gap-2 mt-3">
							<Button
								size="sm"
								className="flex-1 gap-1.5 h-9 text-sm font-semibold"
								onClick={() => void activateUpdate()}
							>
								<RefreshCw className="w-3.5 h-3.5" />
								Actualitza
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-9 text-sm text-muted-foreground"
								onClick={() => {
									toast.dismiss(id);
									resetUpdateToast();
								}}
							>
								Més tard
							</Button>
						</div>
					</div>
				),
				{
					id: UPDATE_TOAST_ID,
					duration: Number.POSITIVE_INFINITY,
				},
			);
		};

		const onControllerChange = () => {
			const reload = pendingReload;
			if (!reload) return;
			pendingReload = null;
			window.clearTimeout(activationTimeout);
			isActivating = false;
			reload();
			if (!reloadRequested) showUpdateToast();
			drainPendingReturn();
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
			if (!workers) throw new Error("Service workers are unavailable");
			const nextRegistration = await workers.register(
				getServiceWorkerUrl(version),
			);
			if (!disposed) setRegistration(nextRegistration);
			return nextRegistration;
		};

		const canReloadAutomatically = (target: string, revision: number) => {
			if (
				disposed ||
				reloadRequested ||
				document.visibilityState !== "visible" ||
				interactionRevision !== revision ||
				!navigator.onLine
			)
				return false;
			try {
				// Remember attempts across document loads. The cooldown also prevents
				// alternating servers during a rolling deployment from causing a loop.
				return (
					sessionStorage.getItem(RELOAD_TARGET_KEY) !== target &&
					Date.now() - Number(sessionStorage.getItem(RELOAD_TIME_KEY) ?? 0) >
						RELOAD_COOLDOWN_MS
				);
			} catch {
				return false;
			}
		};

		const activateUpdate = async (
			request: { kind: "manual" } | { kind: "automatic"; revision: number } = {
				kind: "manual",
			},
		) => {
			if (disposed || reloadRequested || isActivating) return;
			const automatic = request.kind === "automatic";
			const revision =
				request.kind === "automatic" ? request.revision : interactionRevision;
			const version = latestVersion;
			const target = JSON.stringify(version);
			if (automatic && !canReloadAutomatically(target, revision)) return;
			isActivating = true;

			const finishReload = () => {
				if (disposed) return;
				if (automatic && !canReloadAutomatically(target, revision)) return;
				try {
					prepareAppReload();
					if (automatic) {
						sessionStorage.setItem(RELOAD_TARGET_KEY, target);
						sessionStorage.setItem(RELOAD_TIME_KEY, String(Date.now()));
					}
					reloadRequested = true;
					toast.dismiss(UPDATE_TOAST_ID);
					window.location.reload();
				} catch (error) {
					console.warn("Could not preserve progress before updating", error);
					if (!automatic)
						toast.error("No s'ha pogut desar el progrés. Torna-ho a provar.");
				}
			};

			try {
				let preparedWorker: ServiceWorker | null = null;
				if (
					workers &&
					version.serviceWorkerVersion !== getActiveWorkerVersion(registration)
				) {
					const nextRegistration = await registerVersion(
						version.serviceWorkerVersion,
					);
					if (disposed) return;
					if (nextRegistration.installing || nextRegistration.waiting) {
						preparedWorker = await waitForWaitingWorker(nextRegistration);
					}
					// Do not refresh into an installation that failed or timed out.
					if (
						!preparedWorker &&
						!nextRegistration.waiting &&
						new URL(
							nextRegistration.active?.scriptURL ?? location.href,
						).searchParams.get("v") !== version.serviceWorkerVersion
					) {
						throw new Error("Updated service worker is not ready");
					}
				}
				if (disposed) return;
				if (automatic && !canReloadAutomatically(target, revision)) return;
				if (preparedWorker?.state === "redundant")
					throw new Error("Updated service worker became redundant");
				const waitingWorker =
					registration?.waiting ??
					(preparedWorker?.state !== "activated" ? preparedWorker : null);
				if (waitingWorker) {
					prepareAppReload();
					pendingReload = finishReload;
					activationTimeout = window.setTimeout(() => {
						pendingReload = null;
						isActivating = false;
						showUpdateToast();
						drainPendingReturn();
					}, 10_000);
					waitingWorker.postMessage({ type: "SKIP_WAITING" });
				} else {
					finishReload();
				}
			} catch (error) {
				console.warn("Failed to activate app update", error);
				if (!automatic) toast.error("No s'ha pogut actualitzar l'aplicació.");
			} finally {
				if (!pendingReload) isActivating = false;
				if (!disposed && registration?.waiting && !pendingReload)
					showUpdateToast();
			}
		};

		const checkForUpdates = async (revision = interactionRevision) => {
			if (disposed || reloadRequested || document.visibilityState !== "visible")
				return;
			if (isCheckingForUpdates || isActivating) {
				pendingReturnRevision = revision;
				return;
			}
			isCheckingForUpdates = true;
			versionRequest = new AbortController();
			const request = versionRequest;
			const requestTimeout = window.setTimeout(() => request.abort(), 10_000);
			try {
				latestVersion = await fetchLatestVersion(request.signal);
				window.clearTimeout(requestTimeout);
				if (disposed) return;
				if (workers && !registration) {
					const existing = await workers.getRegistration();
					if (disposed) return;
					if (existing) setRegistration(existing);
					else await registerVersion(latestVersion.serviceWorkerVersion);
				}
				if (disposed) return;
				const workerChanged =
					latestVersion.serviceWorkerVersion !==
					getActiveWorkerVersion(registration);
				const releaseChanged =
					APP_RELEASE !== "dev" &&
					latestVersion.sentryRelease !== "dev" &&
					latestVersion.sentryRelease !== APP_RELEASE;
				if (releaseChanged || workerChanged || registration?.waiting) {
					await activateUpdate({ kind: "automatic", revision });
					if (workerChanged) showUpdateToast();
				} else {
					await registration?.update();
				}
			} catch (error) {
				if (!disposed) console.warn("App update check failed", error);
			} finally {
				window.clearTimeout(requestTimeout);
				isCheckingForUpdates = false;
				drainPendingReturn();
			}
		};

		const drainPendingReturn = () => {
			if (
				pendingReturnRevision === null ||
				isActivating ||
				isCheckingForUpdates
			)
				return;
			const revision = pendingReturnRevision;
			pendingReturnRevision = null;
			void checkForUpdates(revision);
		};

		const onInteraction = () => {
			interactionRevision += 1;
		};
		const onPageHide = () => {
			wasBackgrounded = true;
			// An earlier check must not reload after this document is hidden.
			interactionRevision += 1;
		};
		const onReturn = () => {
			if (document.visibilityState === "visible" && wasBackgrounded) {
				wasBackgrounded = false;
				void checkForUpdates();
			}
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") onPageHide();
			else onReturn();
		};
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) wasBackgrounded = true;
			onReturn();
		};

		workers?.addEventListener("controllerchange", onControllerChange);
		window.addEventListener("pagehide", onPageHide);
		window.addEventListener("pageshow", onPageShow);
		document.addEventListener("visibilitychange", onVisibilityChange);
		document.addEventListener("pointerdown", onInteraction, true);
		document.addEventListener("keydown", onInteraction, true);
		document.addEventListener("input", onInteraction, true);
		void checkForUpdates();

		return () => {
			disposed = true;
			versionRequest?.abort();
			pendingReload = null;
			window.clearTimeout(activationTimeout);
			toast.dismiss(UPDATE_TOAST_ID);
			cleanupRegistrationListeners?.();
			workers?.removeEventListener("controllerchange", onControllerChange);
			window.removeEventListener("pagehide", onPageHide);
			window.removeEventListener("pageshow", onPageShow);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			document.removeEventListener("pointerdown", onInteraction, true);
			document.removeEventListener("keydown", onInteraction, true);
			document.removeEventListener("input", onInteraction, true);
		};
	}, []);

	return null;
}
