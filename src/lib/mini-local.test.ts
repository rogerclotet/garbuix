// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	miniHistoryEntries,
	readMiniSaves,
	writeMiniSave,
} from "@/lib/mini-local";
import {
	getAnonymousHistoryEntries,
	saveAnonymousHistoryEntry,
} from "@/lib/puzzle-local";
import { createEmptyProgressState } from "@/lib/puzzle-progress";

beforeEach(() => {
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	});
});
afterEach(() => vi.unstubAllGlobals());

it("keeps Mini saves separate from regular Garbuix and other accounts", () => {
	const parentHistory = {
		dateKey: "2026-01-01",
		seed: 260101,
		totalWords: 12,
		guessedWords: 12,
		guessCount: 15,
		hintsUsed: 2,
		completed: true,
		lastUpdated: "2026-01-01T12:00:00.000Z",
	};
	saveAnonymousHistoryEntry(parentHistory);
	const progress = {
		...createEmptyProgressState({
			id: "mini:2026-01-01",
			initialShuffledLetters: ["a"],
		}),
		hintsUsed: 7,
	};
	writeMiniSave("parent", "2026-01-01", progress);
	expect(readMiniSaves("parent")["2026-01-01"]).toEqual(progress);
	expect(readMiniSaves(null)).toEqual({});
	expect(readMiniSaves("another-parent")).toEqual({});
	expect(getAnonymousHistoryEntries()).toEqual({ "2026-01-01": parentHistory });
	expect(miniHistoryEntries("parent")[0].hintsUsed).toBe(7);
});

it("ignores malformed saves and regular puzzle ids in Mini storage", () => {
	localStorage.setItem("garbuix-mini-v1:guest", "{");
	expect(readMiniSaves(null)).toEqual({});
	writeMiniSave(
		null,
		"2026-01-01",
		createEmptyProgressState({
			id: "regular-puzzle",
			initialShuffledLetters: [],
		}),
	);
	expect(readMiniSaves(null)).toEqual({});
});
