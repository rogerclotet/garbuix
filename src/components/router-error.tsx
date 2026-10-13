import { captureException } from "@sentry/tanstackstart-react";
import {
	type AnyRouter,
	type ErrorComponentProps,
	useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isLikelyNetworkError } from "@/lib/network-error";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

function isRouteChunkError(error: unknown): error is Error {
	return (
		error instanceof Error &&
		/^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS for )/.test(
			error.message,
		)
	);
}

// Online, a missing route bundle usually means a deploy replaced it, which a
// reload fixes. Offline, the bundle or the page's data just could not be
// downloaded, and the same page works once the connection returns.
function isOfflineFailure(error: unknown) {
	if (!navigator.onLine) return true;
	return !isRouteChunkError(error) && isLikelyNetworkError(error);
}

function retryRoute(router: AnyRouter | undefined, error: unknown) {
	// Loading the page again also retries a route bundle that failed to
	// download, which the router does not.
	if (!router || isRouteChunkError(error)) {
		window.location.reload();
		return;
	}
	void router.invalidate();
}

export function RouterErrorComponent({ error }: ErrorComponentProps) {
	const router = useRouter({ warn: false });
	const handled = useRef<{ error: unknown } | null>(null);
	// Decided in the browser: the server never renders an offline failure, and
	// hydrating its page must not disagree with it.
	const [offline, setOffline] = useState(false);

	useIsomorphicLayoutEffect(() => {
		setOffline(isOfflineFailure(error));
	}, [error]);

	useEffect(() => {
		// StrictMode repeats effects; that must not count as a failed reload.
		if (handled.current && Object.is(handled.current.error, error)) return;
		handled.current = { error };
		if (!isRouteChunkError(error)) {
			if (!isOfflineFailure(error)) captureException(error);
			return;
		}

		try {
			// Share TanStack's guard, including component imports it already retried.
			const key = `tanstack_router_reload:${error.message}`;
			if (sessionStorage.getItem(key)) {
				captureException(error);
			} else if (navigator.onLine) {
				sessionStorage.setItem(key, "1");
				window.location.reload();
			}
		} catch {
			// Without storage, keep manual recovery and avoid an automatic loop.
		}
	}, [error]);

	useEffect(() => {
		if (!offline) return;
		const onOnline = () => retryRoute(router, error);
		window.addEventListener("online", onOnline);
		return () => {
			window.removeEventListener("online", onOnline);
		};
	}, [offline, router, error]);

	if (offline) {
		return (
			<div className="flex min-h-[60svh] items-center justify-center p-6 text-center">
				<div className="max-w-sm space-y-3">
					<h1 className="text-2xl font-semibold">Sense connexió</h1>
					<p className="text-sm text-muted-foreground">
						Aquesta pàgina necessita internet per carregar-se. Ho tornarem a
						provar quan recuperis la connexió.
					</p>
					<Button onClick={() => retryRoute(router, error)}>
						Torna-ho a provar
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-6 text-center">
			<div className="space-y-3">
				<h1 className="text-2xl font-semibold">Hi ha hagut un error</h1>
				<p className="text-sm text-muted-foreground">
					Torna-ho a provar recarregant la pàgina.
				</p>
				<Button onClick={() => window.location.reload()}>
					Recarrega la pàgina
				</Button>
			</div>
		</div>
	);
}
