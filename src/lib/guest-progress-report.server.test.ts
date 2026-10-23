import { beforeEach, describe, expect, it, vi } from "vitest";

const { recorded } = vi.hoisted(() => ({
	recorded: [] as unknown[],
}));

vi.mock("@/lib/usage-stats.server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/usage-stats.server")>()),
	recordPuzzleUsage: (usage: unknown) => {
		recorded.push(usage);
	},
}));

import { handleGuestProgressReport } from "@/lib/guest-progress-report.server";

function report(body: unknown) {
	return handleGuestProgressReport(
		new Request("http://localhost/api/guest-progress", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("handleGuestProgressReport", () => {
	beforeEach(() => {
		recorded.length = 0;
	});

	it("counts a guest's start and mints their identity", async () => {
		const response = await report({
			game: "quadrat",
			dateKey: "2026-10-24",
			completed: false,
		});

		expect(response.status).toBe(204);
		expect(response.headers.get("Set-Cookie")).toMatch(/^garbuix_guest=/);
		expect(recorded).toEqual([
			{
				game: "quadrat",
				dateKey: "2026-10-24",
				player: { kind: "guest", id: expect.any(String) },
				started: true,
				completed: false,
			},
		]);
	});

	it("rejects classic reports, which arrive through the leaderboard", async () => {
		const response = await report({
			game: "regular",
			dateKey: "2026-10-24",
			completed: false,
		});

		expect(response.status).toBe(400);
		expect(recorded).toEqual([]);
	});

	it("rejects fields beyond the report", async () => {
		const response = await report({
			game: "mini",
			dateKey: "2026-10-24",
			completed: false,
			name: "Àliga Daurada",
		});

		expect(response.status).toBe(400);
		expect(recorded).toEqual([]);
	});
});
