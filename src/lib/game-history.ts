import type { HistoryState, RouterHistory } from "@tanstack/react-router";

type GameLocation = Pick<RouterHistory["location"], "pathname" | "state">;

type GameHistory = Partial<Record<"/" | "/mini", number>>;

declare module "@tanstack/react-router" {
	interface HistoryState {
		garbuixGameHistory?: GameHistory;
	}
}

const games = ["/", "/mini"] as const;

function previousGames(location: GameLocation): GameHistory {
	const indices = { ...location.state.garbuixGameHistory };
	for (const game of games) {
		if ((indices[game] ?? -1) >= location.state.__TSR_index) {
			delete indices[game];
		}
	}
	return indices;
}

export function getGameHistory(location: GameLocation): GameHistory {
	const indices = previousGames(location);
	const path = location.pathname;
	if (path === "/" || path === "/mini" || path === "/mini/") {
		indices[path === "/" ? "/" : "/mini"] = location.state.__TSR_index;
	}
	return indices;
}

// Keep the game ancestors on each history entry. Unlike component refs, this
// survives reloads and follows the browser's Back/Forward stack automatically.
export function withGameHistory(history: RouterHistory): RouterHistory {
	const push = history.push;
	const replace = history.replace;
	history.push = (path, state: HistoryState = {}, options) => {
		push(
			path,
			{ ...state, garbuixGameHistory: getGameHistory(history.location) },
			options,
		);
	};
	history.replace = (path, state: HistoryState = {}, options) => {
		replace(
			path,
			{ ...state, garbuixGameHistory: previousGames(history.location) },
			options,
		);
	};
	return history;
}
