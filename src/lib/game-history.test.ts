// @vitest-environment jsdom
import {
	createBrowserHistory,
	createMemoryHistory,
} from "@tanstack/react-router";
import { expect, it } from "vitest";
import { getGameHistory, withGameHistory } from "./game-history";

it("restores game ancestors from browser state after recreating history", () => {
	window.history.replaceState(null, "", "/");
	const history = withGameHistory(createBrowserHistory());
	history.push("/mini");
	history.push("/mini/dies-anteriors");
	history.flush();
	history.destroy();

	const reloaded = withGameHistory(createBrowserHistory());
	try {
		expect(reloaded.location.pathname).toBe("/mini/dies-anteriors");
		expect(getGameHistory(reloaded.location)).toEqual({ "/": 0, "/mini": 1 });
	} finally {
		reloaded.destroy();
	}
});

it("forgets game entries discarded by Back followed by a new navigation", () => {
	const history = withGameHistory(
		createMemoryHistory({ initialEntries: ["/"] }),
	);
	history.push("/mini");
	history.push("/mini/dies-anteriors");
	history.go(-2);
	history.push("/preferencies");
	history.push("/privacitat");
	expect(getGameHistory(history.location)).toEqual({ "/": 0 });
});

it("drops a replaced game entry while preserving ancestors and caller state", () => {
	const history = withGameHistory(
		createMemoryHistory({ initialEntries: ["/"] }),
	);
	history.push("/mini");
	history.replace("/preferencies", { __hashScrollIntoViewOptions: false });
	history.push("/privacitat");
	expect(getGameHistory(history.location)).toEqual({ "/": 0 });
	history.back();
	expect(history.location.state.__hashScrollIntoViewOptions).toBe(false);
});
