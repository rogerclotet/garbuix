import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { observeServerAction } from "@/lib/observability-server";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import {
	checkDailyPuzzleExists,
	getAuthSession,
	getCluesForReviewData,
	getDailyPuzzlePublicData,
	getHistoryPageDataForUser,
	getModelRatingSummaryData,
	getSessionUserData,
	getUserPuzzleProgressData,
	getWordCluesData,
	importAnonymousProgressForUser,
	isAdminEmail,
	submitClueRatingData,
	syncPuzzleEventsForUser,
	triggerDailyPuzzleGeneration,
} from "@/lib/puzzle-service.server";
import type {
	AnonymousImportPayload,
	PuzzleClientEvent,
} from "@/lib/puzzle-types";

export const getDailyPuzzlePublic = createServerFn({ method: "GET" })
	.inputValidator(
		z
			.object({
				dateKey: z.string().optional(),
			})
			.optional(),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getDailyPuzzlePublic",
			() => getDailyPuzzlePublicData(data?.dateKey),
			{
				properties: {
					date_key: data?.dateKey,
				},
			},
		);
	});

export const getDailyPuzzlePageData = createServerFn({ method: "POST" })
	.inputValidator(
		z
			.object({
				dateKey: z.string().optional(),
			})
			.optional(),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getDailyPuzzlePageData",
			async () => {
				const dateKey = data?.dateKey ?? getTodayDateKey();
				const puzzleExists = await checkDailyPuzzleExists(dateKey);

				if (!puzzleExists) {
					triggerDailyPuzzleGeneration(dateKey);
					return { status: "generating" as const };
				}

				const dailyData = await getDailyPuzzlePublicData(data?.dateKey);
				const progress = dailyData.sessionUser
					? await getUserPuzzleProgressData(
							dailyData.puzzle.id,
							dailyData.sessionUser.id,
						)
					: null;

				return {
					status: "ready" as const,
					...dailyData,
					progress,
				};
			},
			{
				properties: {
					date_key: data?.dateKey,
				},
			},
		);
	});

export const pollDailyPuzzleReady = createServerFn({ method: "GET" }).handler(
	async () => {
		return observeServerAction("pollDailyPuzzleReady", async () => {
			const dateKey = getTodayDateKey();
			const puzzleExists = await checkDailyPuzzleExists(dateKey);

			if (!puzzleExists) {
				triggerDailyPuzzleGeneration(dateKey);
				return null;
			}

			const dailyData = await getDailyPuzzlePublicData(dateKey);
			const progress = dailyData.sessionUser
				? await getUserPuzzleProgressData(
						dailyData.puzzle.id,
						dailyData.sessionUser.id,
					)
				: null;

			return { ...dailyData, progress };
		});
	},
);

export const getSessionUser = createServerFn({ method: "POST" }).handler(
	async () => observeServerAction("getSessionUser", () => getSessionUserData()),
);

export const getUserPuzzleProgress = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			puzzleId: z.string(),
		}),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getUserPuzzleProgress",
			async () => {
				const session = await getAuthSession();
				if (!session) {
					return null;
				}

				return getUserPuzzleProgressData(data.puzzleId, session.user.id);
			},
			{
				properties: {
					puzzle_id: data.puzzleId,
				},
			},
		);
	});

export const syncUserPuzzleEvents = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			puzzleId: z.string(),
			deviceId: z.string(),
			events: z.custom<PuzzleClientEvent[]>(),
			leaderboardOptOut: z.boolean().optional(),
		}),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"syncUserPuzzleEvents",
			async () => {
				const session = await getAuthSession();
				if (!session) {
					throw new Error("Unauthorized");
				}

				return syncPuzzleEventsForUser({
					puzzleId: data.puzzleId,
					userId: session.user.id,
					deviceId: data.deviceId,
					events: data.events,
					leaderboardOptOut: data.leaderboardOptOut ?? false,
				});
			},
			{
				properties: {
					device_id: data.deviceId,
					event_count: data.events.length,
					puzzle_id: data.puzzleId,
				},
			},
		);
	});

export const getWordClues = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			puzzleId: z.string(),
			wordIds: z.array(z.number()),
		}),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getWordClues",
			async () => {
				const session = await getAuthSession();
				if (!session) {
					return {} as Record<number, string>;
				}

				return getWordCluesData(data.puzzleId, data.wordIds);
			},
			{
				properties: {
					puzzle_id: data.puzzleId,
					word_count: data.wordIds.length,
				},
			},
		);
	});

async function requireAdminSession() {
	const session = await getAuthSession();
	if (!session) {
		throw new Error("Unauthorized");
	}
	if (!isAdminEmail(session.user.email)) {
		throw new Error("Forbidden");
	}
	return session;
}

export const getCluesForReview = createServerFn({ method: "POST" })
	.inputValidator(
		z
			.object({
				dateKey: z.string().optional(),
			})
			.optional(),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getCluesForReview",
			async () => {
				const session = await requireAdminSession();
				return getCluesForReviewData(session.user.email, data?.dateKey);
			},
			{
				properties: {
					date_key: data?.dateKey,
				},
			},
		);
	});

export const submitClueRating = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			clueId: z.string(),
			winner: z.enum(["a", "b", "tie"]),
		}),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"submitClueRating",
			async () => {
				const session = await requireAdminSession();
				await submitClueRatingData({
					clueId: data.clueId,
					winner: data.winner,
					reviewerEmail: session.user.email,
				});
				return { ok: true as const };
			},
			{
				properties: {
					clue_id: data.clueId,
					winner: data.winner,
				},
			},
		);
	});

export const getModelRatingSummary = createServerFn({ method: "POST" })
	.inputValidator(
		z
			.object({
				dateKey: z.string().optional(),
			})
			.optional(),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getModelRatingSummary",
			async () => {
				await requireAdminSession();
				return getModelRatingSummaryData(data?.dateKey);
			},
			{
				properties: {
					date_key: data?.dateKey,
				},
			},
		);
	});

export const getHistoryPageData = createServerFn({ method: "POST" })
	.inputValidator(
		z
			.object({
				dateKey: z.string().optional(),
			})
			.optional(),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getHistoryPageData",
			async () => {
				const session = await getAuthSession();
				return getHistoryPageDataForUser(session?.user.id, data?.dateKey);
			},
			{
				properties: {
					date_key: data?.dateKey,
				},
			},
		);
	});

export const importAnonymousProgress = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			deviceId: z.string(),
			payload: z.custom<AnonymousImportPayload>(),
		}),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"importAnonymousProgress",
			async () => {
				const session = await getAuthSession();
				if (!session) {
					throw new Error("Unauthorized");
				}

				return importAnonymousProgressForUser({
					userId: session.user.id,
					payload: data.payload,
				});
			},
			{
				properties: {
					active_progress_count: Object.keys(data.payload.activeProgressByDate)
						.length,
					device_id: data.deviceId,
					history_entry_count: data.payload.historyEntries.length,
				},
			},
		);
	});
