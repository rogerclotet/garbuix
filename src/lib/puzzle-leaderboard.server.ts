import { eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { getClueInbox } from "@/lib/clue-request.server";
import { db } from "@/lib/db";
import {
	leaderboardDisplayName,
	recordProgress as recordLeaderboardProgress,
	userParticipantId,
} from "@/lib/leaderboard.server";
import { getPeerClueWordIds } from "@/lib/puzzle-progress-store.server";
import { resolveAvatarImage, resolveDisplayName } from "@/lib/user-profile";

export async function publishLeaderboardForUser(input: {
	dateKey: string;
	userId: string;
	puzzleId: string;
	wordsFound: number;
	totalWords: number;
	freeCluesUsed: number;
	tryCount: number;
	completedAt: string | null;
	previousWordsFound: number;
	previousCompletedAt: string | null;
}) {
	try {
		const profiles = await db
			.select({
				name: user.name,
				displayName: user.displayName,
				image: user.image,
				useGoogleAvatar: user.useGoogleAvatar,
			})
			.from(user)
			.where(eq(user.id, input.userId))
			.limit(1);
		const profile = profiles[0];
		if (!profile) return;

		const displayName = leaderboardDisplayName(resolveDisplayName(profile));
		const avatarImage = resolveAvatarImage(profile);

		// Total clues = the free clues spent plus one per word a friend sent a
		// clue for. The saved ids also hold clues received as a guest before
		// signing in; the inbox covers deliveries the database missed.
		const [inbox, savedWordIds] = await Promise.all([
			getClueInbox(input.userId, input.dateKey),
			getPeerClueWordIds(input.userId, input.puzzleId),
		]);
		const friendClues = new Set([
			...inbox.map((response) => response.wordId),
			...savedWordIds,
		]).size;

		await recordLeaderboardProgress({
			dateKey: input.dateKey,
			participantId: userParticipantId(input.userId),
			kind: "user",
			name: displayName,
			image: avatarImage,
			wordsFound: input.wordsFound,
			totalWords: input.totalWords,
			clueCount: input.freeCluesUsed + friendClues,
			tryCount: input.tryCount,
			completedAt: input.completedAt,
			previousWordsFound: input.previousWordsFound,
			previousCompletedAt: input.previousCompletedAt,
		});
	} catch (error) {
		console.warn("[leaderboard] publish for user failed", error);
	}
}
