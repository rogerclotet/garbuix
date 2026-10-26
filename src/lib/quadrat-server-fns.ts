import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { readAnonDeviceId } from "@/lib/anon-session.server";
import { getNextRolloverAt, getYesterdayDateKey } from "@/lib/puzzle-dates";
import { progressStateSchema } from "@/lib/puzzle-event-schemas";
import { getAuthSession } from "@/lib/puzzle-service.server";
import {
	ensureQuadratPuzzle,
	getQuadratCluesData,
	getQuadratHistory,
	getQuadratProgress,
	getQuadratSolution,
	saveQuadratProgress,
	toQuadratPublicPuzzle,
} from "@/lib/quadrat.server";
import { consumeRateLimit, getClientAddress } from "@/lib/rate-limit.server";
import type { WordCluesResult } from "@/lib/word-clues";

export const getQuadratPageData = createServerFn({ method: "GET" }).handler(
	async () => {
		const [row, session] = await Promise.all([
			ensureQuadratPuzzle(),
			getAuthSession(),
		]);
		return {
			puzzle: toQuadratPublicPuzzle(row),
			progress: session
				? await getQuadratProgress(session.user.id, row.id)
				: null,
			userId: session?.user.id ?? null,
			rolloverAt: getNextRolloverAt().toISOString(),
		};
	},
);

export const syncQuadratProgress = createServerFn({ method: "POST" })
	.validator(progressStateSchema)
	.handler(async ({ data }) => {
		const session = await getAuthSession();
		if (!session) throw new Error("Unauthorized");
		return saveQuadratProgress(session.user.id, data);
	});

export const getQuadratHistoryData = createServerFn({ method: "GET" }).handler(
	async () => {
		const [yesterday, session] = await Promise.all([
			getQuadratSolution(getYesterdayDateKey()),
			getAuthSession(),
		]);
		return {
			userId: session?.user.id ?? null,
			entries: session ? await getQuadratHistory(session.user.id) : [],
			yesterday,
		};
	},
);

// Same budget as the classic clue endpoint, in buckets of its own.
export const getQuadratClues = createServerFn({ method: "POST" })
	.validator(
		z.object({
			puzzleId: z.string().min(1).max(64),
			wordIds: z.array(z.number().int().min(0).max(10_000)).max(20),
		}),
	)
	.handler(async ({ data }): Promise<WordCluesResult> => {
		const request = new Request("http://localhost", {
			headers: new Headers(getRequestHeaders()),
		});
		const clientAddress = getClientAddress(request);
		const session = await getAuthSession();
		const anonDeviceId = readAnonDeviceId(request);

		const rateLimits = await Promise.all([
			consumeRateLimit({
				key: `quadrat-clues:ip:${clientAddress}`,
				limit: session ? 120 : 40,
				windowSeconds: 60 * 60,
			}),
			session
				? consumeRateLimit({
						key: `quadrat-clues:user:${session.user.id}`,
						limit: 60,
						windowSeconds: 60 * 60,
					})
				: anonDeviceId
					? consumeRateLimit({
							key: `quadrat-clues:anon:${anonDeviceId}`,
							limit: 30,
							windowSeconds: 60 * 60,
						})
					: null,
		]);
		const retryAfterSeconds = Math.max(
			0,
			...rateLimits.map((limit) =>
				limit != null && !limit.allowed ? limit.retryAfterSeconds : 0,
			),
		);
		if (retryAfterSeconds > 0) {
			return { kind: "rate_limited", retryAfterSeconds };
		}

		return {
			kind: "ok",
			clues: await getQuadratCluesData({
				puzzleId: data.puzzleId,
				wordIds: data.wordIds,
				userId: session?.user.id ?? null,
			}),
		};
	});
