import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeRateLimit, getWordCluesData, getAuthSession } = vi.hoisted(
	() => ({
		consumeRateLimit: vi.fn(),
		getWordCluesData: vi.fn(),
		getAuthSession: vi.fn(),
	}),
);

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: unknown) => handler,
		inputValidator: () => ({ handler: (handler: unknown) => handler }),
	}),
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/anon-session.server", () => ({
	readAnonDeviceId: () => "guest-1",
}));
vi.mock("@/lib/observability-server", () => ({
	observeServerAction: (_name: string, action: () => Promise<unknown>) =>
		action(),
}));
vi.mock("@/lib/puzzle-service.server", () => ({
	getWordCluesData,
	getAuthSession,
}));
vi.mock("@/lib/rate-limit.server", () => ({
	consumeRateLimit,
	getClientAddress: () => "127.0.0.1",
}));

import { getWordClues } from "@/lib/puzzle-server-fns";

beforeEach(() => {
	consumeRateLimit
		.mockReset()
		.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
	getWordCluesData.mockReset().mockResolvedValue({ 0: "Saved clue" });
	getAuthSession.mockReset().mockResolvedValue({ user: { id: "user-1" } });
});

describe("getWordClues rate limit result", () => {
	it("returns the longest exceeded bucket cooldown without reading clues or throwing", async () => {
		consumeRateLimit
			.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 })
			.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 120 });
		await expect(
			getWordClues({ data: { puzzleId: "puzzle-1", wordIds: [0] } }),
		).resolves.toEqual({
			kind: "rate_limited",
			retryAfterSeconds: 120,
		});
		expect(getWordCluesData).not.toHaveBeenCalled();
	});

	it("returns authorized clues when the quotas allow the lookup", async () => {
		await expect(
			getWordClues({ data: { puzzleId: "puzzle-1", wordIds: [0] } }),
		).resolves.toEqual({
			kind: "ok",
			clues: { 0: "Saved clue" },
		});
		expect(getWordCluesData).toHaveBeenCalledWith({
			puzzleId: "puzzle-1",
			wordIds: [0],
			userId: "user-1",
		});
	});
});
