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

export type GameMode = "regular" | "mini" | "syllables" | "quadrat";

export const GAME_PATHS = {
	regular: "/",
	mini: "/mini",
	syllables: "/sillabes",
	quadrat: "/quadrat",
} as const satisfies Record<GameMode, string>;

export type GamePath = (typeof GAME_PATHS)[GameMode];

export function getGameForPathname(pathname: string): GameMode {
	for (const game of ["mini", "syllables", "quadrat"] as const) {
		const gamePath = GAME_PATHS[game];
		if (pathname === gamePath || pathname.startsWith(`${gamePath}/`)) {
			return game;
		}
	}
	return "regular";
}

// The game whose page is on screen, including its inner pages.
export function useRenderedGame(): GameMode {
	return getGameForPathname(useRenderedPathname());
}
