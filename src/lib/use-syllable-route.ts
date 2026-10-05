import { useRouterState } from "@tanstack/react-router";

export function useSyllableRoute() {
	return useRouterState({
		select: ({ location }) =>
			location.pathname === "/sillabes" ||
			location.pathname.startsWith("/sillabes/"),
	});
}
