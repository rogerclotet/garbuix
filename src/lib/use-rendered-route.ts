import { useRouterState } from "@tanstack/react-router";

// The router moves `location` to the target as soon as a navigation starts,
// but keeps the previous page mounted until the target's loader resolves.
// The matches change in the same commit as the page, so anything that has to
// change together with the page reads them instead of `location`.
export function useRenderedPathname(): string {
	return useRouterState({
		select: ({ matches }) => {
			const pathname = matches.at(-1)?.pathname ?? "/";
			// An index route matches as "/mini/" where `location` says "/mini".
			return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
		},
	});
}

export function useRenderedGameRoute(gamePath: "/mini" | "/sillabes"): boolean {
	const pathname = useRenderedPathname();
	return pathname === gamePath || pathname.startsWith(`${gamePath}/`);
}
