import type { AnyRouter } from "@tanstack/react-router";
import { isLikelyNetworkError } from "@/lib/network-error";

// The last data each route rendered in this document, by route id.
const lastLoaderData = new Map<string, unknown>();

// Pages hydrate from the data the server rendered into them, without running
// their loaders in the browser, so record what each rendered route received.
export function rememberRenderedLoaderData(router: AnyRouter) {
	return router.subscribe("onRendered", () => {
		for (const match of router.state.matches) {
			if (match.status === "success" && match.loaderData !== undefined) {
				lastLoaderData.set(match.routeId, match.loaderData);
			}
		}
	});
}

// The router reloads a page's data each time the page is entered, and shows
// the error page when that read fails. Offline, a page this document already
// rendered keeps the data it had instead: the games keep their own progress on
// the device and reconcile it once the network returns.
export function withOfflineFallback<TData>(load: () => Promise<TData>) {
	return async ({ route }: { route: { id: string } }): Promise<TData> => {
		try {
			const data = await load();
			if (typeof window !== "undefined") lastLoaderData.set(route.id, data);
			return data;
		} catch (error) {
			if (
				typeof window !== "undefined" &&
				lastLoaderData.has(route.id) &&
				isLikelyNetworkError(error)
			) {
				return lastLoaderData.get(route.id) as TData;
			}
			throw error;
		}
	};
}
