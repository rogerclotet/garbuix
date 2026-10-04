import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { getBundleRecovery } from "@/lib/bundle-recovery";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

export function RouterErrorComponent({ error }: ErrorComponentProps) {
	const reported = useRef<{ error: unknown } | null>(null);

	// Invalidate recovery before the router acknowledges this error UI's render.
	useIsomorphicLayoutEffect(() => {
		if (reported.current && Object.is(reported.current.error, error)) return;
		reported.current = { error };
		getBundleRecovery().handleError(error);
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
