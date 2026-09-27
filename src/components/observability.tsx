import { getRouteApi, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { captureUsage, clearLegacyPostHogStorage } from "@/lib/usage-client";

import { UsageEnabledContext } from "@/lib/usage-context";

const rootRoute = getRouteApi("__root__");

export function ObservabilityProvider({ children }: { children: ReactNode }) {
	const { observability } = rootRoute.useLoaderData();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const previousPage = useRef<string | null>(null);
	const enabled = observability.analyticsEnabled;

	useEffect(() => {
		clearLegacyPostHogStorage();
	}, []);
	useEffect(() => {
		if (!enabled || previousPage.current === pathname) return;
		previousPage.current = pathname;
		captureUsage({ event: "page_view" }, pathname);
	}, [enabled, pathname]);

	return <UsageEnabledContext value={enabled}>{children}</UsageEnabledContext>;
}
