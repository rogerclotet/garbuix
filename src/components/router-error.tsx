import { captureException } from "@sentry/tanstackstart-react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function RouterErrorComponent({ error }: ErrorComponentProps) {
	const handled = useRef<{ error: unknown } | null>(null);

	useEffect(() => {
		// StrictMode repeats effects; that must not count as a failed reload.
		if (handled.current && Object.is(handled.current.error, error)) return;
		handled.current = { error };
		if (
			!(error instanceof Error) ||
			!/^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS for )/.test(
				error.message,
			)
		) {
			captureException(error);
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
