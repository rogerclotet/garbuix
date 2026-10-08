// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	addAnonymousPeerClueWordIds,
	buildAnonymousImportPayload,
	clearAnonymousPeerClueWordIds,
	getAnonymousPeerClueWordIds,
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
afterEach(() => vi.unstubAllGlobals());

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
