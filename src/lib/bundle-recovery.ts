import { captureException, captureMessage } from "@sentry/tanstackstart-react";
import type { AnyRouter } from "@tanstack/react-router";
import { z } from "zod";
import { BUNDLE_RECOVERY_SUCCESS_MESSAGE } from "../../sentry-privacy";

const RELOAD_PREFIX = "tanstack_router_reload:";
const PENDING_KEY = "route-bundle-recovery";
const MAX_RECOVERY_AGE_MS = 5 * 60 * 1000;
const bundleErrorPattern =
	/^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS for )/;
const pendingSchema = z.object({
	message: z.string().regex(bundleErrorPattern),
	pathname: z.string(),
	createdAt: z.number().finite(),
});

function reloadKeys() {
	const keys = new Set<string>();
	for (let index = 0; index < sessionStorage.length; index++) {
		const key = sessionStorage.key(index);
		if (key?.startsWith(RELOAD_PREFIX)) keys.add(key);
	}
	return keys;
}

// One instance per document. The factory also lets tests exercise a real
// sessionStorage handoff between two documents without navigating jsdom.
export function createBundleRecovery() {
	let knownKeys = new Set<string>();
	let incoming: z.infer<typeof pendingSchema> | undefined;
	try {
		knownKeys = reloadKeys();
		const raw = sessionStorage.getItem(PENDING_KEY);
		sessionStorage.removeItem(PENDING_KEY);
		const parsed = pendingSchema.safeParse(raw ? JSON.parse(raw) : null);
		if (parsed.success) {
			const age = Date.now() - parsed.data.createdAt;
			if (
				age >= 0 &&
				age <= MAX_RECOVERY_AGE_MS &&
				parsed.data.pathname === window.location.pathname &&
				sessionStorage.getItem(`${RELOAD_PREFIX}${parsed.data.message}`)
			)
				incoming = parsed.data;
		}
	} catch {
		// Recovery telemetry must also work when storage is unavailable.
	}

	function recordAttempt(error: Error) {
		knownKeys.add(`${RELOAD_PREFIX}${error.message}`);
		try {
			sessionStorage.setItem(
				PENDING_KEY,
				JSON.stringify({
					message: error.message,
					pathname: window.location.pathname,
					createdAt: Date.now(),
				}),
			);
		} catch {
			// A telemetry write failure must not prevent the guarded reload.
		}
		captureException(error, {
			level: "warning",
			tags: { bundle_recovery: "attempted" },
		});
	}

	return {
		// TanStack's lazyRouteComponent writes its own guard and reloads before
		// our boundary renders. Observe new guards on departure, without changing
		// its retry behavior or reloading on background preload failures.
		pageHide() {
			try {
				for (const key of reloadKeys()) {
					if (knownKeys.has(key)) continue;
					const message = key.slice(RELOAD_PREFIX.length);
					if (bundleErrorPattern.test(message))
						recordAttempt(new Error(message));
				}
			} catch {
				// Storage can be revoked after startup.
			}
		},
		failed() {
			incoming = undefined;
		},
		watchRouter(router: AnyRouter) {
			return router.subscribe("onRendered", () => {
				if (!incoming) return;
				if (router.state.location.pathname !== incoming.pathname) {
					incoming = undefined;
					return;
				}
				if (
					router.state.matches.length === 0 ||
					!router.state.matches.every((match) => match.status === "success")
				)
					return;
				incoming = undefined;
				captureMessage(BUNDLE_RECOVERY_SUCCESS_MESSAGE, {
					level: "info",
					tags: { bundle_recovery: "recovered" },
				});
			});
		},
		handleError(error: unknown) {
			incoming = undefined;
			if (
				!(error instanceof Error) ||
				!bundleErrorPattern.test(error.message)
			) {
				captureException(error);
				return;
			}

			let status: "retry_failed" | "unavailable" = "unavailable";
			try {
				const key = `${RELOAD_PREFIX}${error.message}`;
				if (sessionStorage.getItem(key)) {
					status = "retry_failed";
				} else if (navigator.onLine) {
					sessionStorage.setItem(key, "1");
					recordAttempt(error);
					window.location.reload();
					return;
				}
			} catch {
				// Without a persistent guard, automatic reloads could loop.
			}
			captureException(error, {
				level: "error",
				tags: { bundle_recovery: status },
			});
		},
	};
}

let recovery: ReturnType<typeof createBundleRecovery> | undefined;

export function getBundleRecovery() {
	recovery ??= createBundleRecovery();
	return recovery;
}
