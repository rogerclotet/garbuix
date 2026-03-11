import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { useObservability } from "@/lib/use-observability";

export function RouterErrorComponent({ error }: ErrorComponentProps) {
	const { captureException } = useObservability();

	useEffect(() => {
		captureException(error, {
			scope: "router_error_boundary",
		});
	}, [captureException, error]);

	return (
		<div className="flex min-h-screen items-center justify-center p-6 text-center">
			<div className="space-y-3">
				<h1 className="text-2xl font-semibold">Hi ha hagut un error</h1>
				<p className="text-sm text-muted-foreground">
					Torna-ho a provar recarregant la pàgina.
				</p>
			</div>
		</div>
	);
}
