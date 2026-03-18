import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { observeServerAction } from "@/lib/observability-server";
import {
	getAuthSession,
	getDailyPuzzlePublicData,
	getHistoryPageDataForUser,
	getSessionUserData,
	getUserPuzzleProgressData,
	importAnonymousProgressForUser,
	syncPuzzleEventsForUser,
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
				const dailyData = await getDailyPuzzlePublicData(data?.dateKey);
				const progress = dailyData.sessionUser
					? await getUserPuzzleProgressData(
							dailyData.puzzle.id,
							dailyData.sessionUser.id,
						)
					: null;

				return {
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
