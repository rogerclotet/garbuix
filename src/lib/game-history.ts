import type { HistoryState, RouterHistory } from "@tanstack/react-router";
import { GAME_PATHS, type GamePath } from "@/lib/use-rendered-route";

type GameLocation = Pick<RouterHistory["location"], "pathname" | "state">;

type GameHistory = Partial<Record<GamePath, number>>;

declare module "@tanstack/react-router" {
	interface HistoryState {
		garbuixGameHistory?: GameHistory;
	}
}

const games = Object.values(GAME_PATHS);

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
	// An index route can arrive with or without its trailing slash.
	const path =
		location.pathname.length > 1
			? location.pathname.replace(/\/$/, "")
			: location.pathname;
	const game = games.find((gamePath) => gamePath === path);
	if (game) indices[game] = location.state.__TSR_index;
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
