import { useRouterState } from "@tanstack/react-router";

export function useMiniRoute() {
	return useRouterState({
		select: ({ location }) =>
			location.pathname === "/mini" || location.pathname.startsWith("/mini/"),
	});
}
