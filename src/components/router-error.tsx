import { captureException } from "@sentry/tanstackstart-react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

function reloadMissingRouteBundle(error: Error) {
	const isBundleError =
		/^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS for )/.test(
			error.message,
		);
	if (!isBundleError || !navigator.onLine) return false;

	// lazyRouteComponent already retries component imports. Split loaders and
	// route options can fail here instead, so share its guard to avoid a second
	// reload when the component retry has already failed.
	const key = `tanstack_router_reload:${error.message}`;
	try {
		if (sessionStorage.getItem(key)) return false;
		sessionStorage.setItem(key, "1");
	} catch {
		// Without a persistent guard, automatic reloads could loop.
		return false;
	}
	window.location.reload();
	return true;
}

export function RouterErrorComponent({ error }: ErrorComponentProps) {
	const reloadingError = useRef<Error | null>(null);

	useEffect(() => {
		captureException(error);
		if (error instanceof Error) {
			if (reloadingError.current === error) return;
			if (reloadMissingRouteBundle(error)) {
				reloadingError.current = error;
				return;
			}
		}
	}, [error]);

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
