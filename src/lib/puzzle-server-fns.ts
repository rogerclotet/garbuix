import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { observeServerAction } from "@/lib/observability-server";
import { getTodayDateKey, isPlayableDateKey } from "@/lib/puzzle-dates";
import {
	checkDailyPuzzleExists,
	getAuthSession,
	getDailyPuzzleDifficulty as getDailyPuzzleDifficultyData,
	getDailyPuzzlePublicData,
	getHistoryEntriesPageForUser,
	getHistoryPageDataForUser,
	getSessionUserData,
	getUserPuzzleProgressData,
	getWordCluesData,
	importAnonymousProgressForUser,
	syncPuzzleEventsForUser,
	triggerDailyPuzzleGeneration,
	updateUserProfileData,
} from "@/lib/puzzle-service.server";
import {
	type AnonymousImportPayload,
	HISTORY_PAGE_SIZE,
	type HistoryEntriesPage,
	type PuzzleClientEvent,
} from "@/lib/puzzle-types";

// Every date key that reaches a server function comes from the client, so it is
// validated at the boundary: well-formed, a real calendar date, and never in the
// future. Without this a caller could name tomorrow and pull an unplayed board
// (answer capsules included) before rollover. Generation itself is guarded
// separately in triggerDailyPuzzleGeneration.
const dateKeyInput = z
	.object({
		dateKey: z
			.string()
			.refine(isPlayableDateKey, {
				error: "dateKey must be a past or current date (YYYY-MM-DD)",
			})
			.optional(),
	})
	.optional();

export const getDailyPuzzlePublic = createServerFn({ method: "GET" })
	.inputValidator(dateKeyInput)
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

export const getDailyPuzzleDifficulty = createServerFn({ method: "GET" })
	.inputValidator(dateKeyInput)
	.handler(async ({ data }) => {
		return observeServerAction(
			"getDailyPuzzleDifficulty",
			() => getDailyPuzzleDifficultyData(data?.dateKey),
			{
				properties: {
					date_key: data?.dateKey,
				},
			},
		);
	});

export const getDailyPuzzlePageData = createServerFn({ method: "POST" })
	.inputValidator(dateKeyInput)
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
			async () => getWordCluesData(data.puzzleId, data.wordIds),
			{
				properties: {
					puzzle_id: data.puzzleId,
					word_count: data.wordIds.length,
				},
			},
		);
	});

export const getHistoryPageData = createServerFn({ method: "POST" })
	.inputValidator(dateKeyInput)
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

export const getMoreHistoryEntries = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			offset: z.number().int().nonnegative(),
		}),
	)
	.handler(async ({ data }): Promise<HistoryEntriesPage> => {
		return observeServerAction(
			"getMoreHistoryEntries",
			async () => {
				const session = await getAuthSession();
				if (!session) {
					return { entries: [], hasMore: false };
				}

				return getHistoryEntriesPageForUser(session.user.id, {
					offset: data.offset,
					limit: HISTORY_PAGE_SIZE,
				});
			},
			{
				properties: {
					offset: data.offset,
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
					deviceId: data.deviceId,
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

export const updateUserProfile = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			displayName: z.string().optional(),
			useGoogleAvatar: z.boolean().optional(),
		}),
	)
	.handler(async ({ data }) => {
		return observeServerAction(
			"updateUserProfile",
			async () => {
				const session = await getAuthSession();
				if (!session) {
					throw new Error("Unauthorized");
				}

				return updateUserProfileData({
					userId: session.user.id,
					displayName: data.displayName,
					useGoogleAvatar: data.useGoogleAvatar,
				});
			},
			{
				properties: {
					has_display_name: data.displayName !== undefined,
					has_avatar_preference: data.useGoogleAvatar !== undefined,
				},
			},
		);
	});
