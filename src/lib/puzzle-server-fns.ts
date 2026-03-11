import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
		return getDailyPuzzlePublicData(data?.dateKey);
	});

export const getSessionUser = createServerFn({ method: "GET" }).handler(
	async () => getSessionUserData(),
);

export const getUserPuzzleProgress = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			puzzleId: z.string(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await getAuthSession();
		if (!session) {
			return null;
		}

		return getUserPuzzleProgressData(data.puzzleId, session.user.id);
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
	});

export const getHistoryPageData = createServerFn({ method: "GET" })
	.inputValidator(
		z
			.object({
				dateKey: z.string().optional(),
			})
			.optional(),
	)
	.handler(async ({ data }) => {
		const session = await getAuthSession();
		return getHistoryPageDataForUser(session?.user.id, data?.dateKey);
	});

export const importAnonymousProgress = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			deviceId: z.string(),
			payload: z.custom<AnonymousImportPayload>(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await getAuthSession();
		if (!session) {
			throw new Error("Unauthorized");
		}

		return importAnonymousProgressForUser({
			userId: session.user.id,
			payload: data.payload,
		});
	});
