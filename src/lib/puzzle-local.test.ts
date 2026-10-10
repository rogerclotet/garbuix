// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	addAnonymousPeerClueWordIds,
	buildAnonymousImportPayload,
	clearAnonymousPeerClueWordIds,
	getAnonymousPeerClueWordIds,
	hasSeenWelcome,
	isWelcomePostponedToday,
	postponeWelcomeForToday,
} from "@/lib/puzzle-local";

beforeEach(() => {
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		get length() {
			return values.size;
		},
		key: (index: number) => [...values.keys()][index] ?? null,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key),
	});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it("keeps each guest friend clue once per day and sends them on sign-in", () => {
	addAnonymousPeerClueWordIds("2026-06-10", [3]);
	addAnonymousPeerClueWordIds("2026-06-11", [2]);
	expect(addAnonymousPeerClueWordIds("2026-06-11", [2, 1])).toEqual([1, 2]);

	expect(buildAnonymousImportPayload().peerClueWordIdsByDate).toEqual({
		"2026-06-10": [3],
		"2026-06-11": [1, 2],
	});

	clearAnonymousPeerClueWordIds("2026-06-11");
	expect(getAnonymousPeerClueWordIds("2026-06-11")).toEqual([]);
});

it("postpones the welcome only until the next day", () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
	expect(isWelcomePostponedToday()).toBe(false);

	postponeWelcomeForToday();
	vi.setSystemTime(new Date("2026-06-10T20:00:00Z"));
	expect(isWelcomePostponedToday()).toBe(true);

	vi.setSystemTime(new Date("2026-06-11T08:00:00Z"));
	expect(isWelcomePostponedToday()).toBe(false);
	expect(hasSeenWelcome()).toBe(false);
});
