import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
	leaderboardDisplayName,
	updateLeaderboardProfile,
	userParticipantId,
} from "@/lib/leaderboard.server";
import { openAnswerCapsule } from "@/lib/puzzle-crypto";
import { getNextRolloverAt, getTodayDateKey } from "@/lib/puzzle-dates";
import { toPuzzleDifficulty } from "@/lib/puzzle-difficulty";
import {
	DailyPuzzleNotFoundError,
	getDailyValidNormalizedGuesses,
	readDailyPuzzleRow,
} from "@/lib/puzzle-generation.server";
import { getHistoryEntriesForUser } from "@/lib/puzzle-history.server";
import {
	ensureHintCapsulesCoverGrid,
	hydratePublicSnapshotWordMetadata,
} from "@/lib/puzzle-snapshot";
import type {
	DailyPuzzlePublic,
	PuzzleProgressState,
	SessionUser,
} from "@/lib/puzzle-types";
import {
	normalizeDisplayNameInput,
	resolveAvatarImage,
	resolveDisplayName,
} from "@/lib/user-profile";

// Keep the existing entry points while the implementations have focused owners.
export {
	checkDailyPuzzleExists,
	DailyPuzzleNotFoundError,
	ensureDailyPuzzleSnapshot,
	getDailyPuzzleDifficulty,
	PUZZLE_ALGORITHM_VERSION,
	readDailyPuzzleRow,
	triggerDailyPuzzleGeneration,
} from "@/lib/puzzle-generation.server";
export {
	type AccountHistoryPage,
	getHistoryEntriesForUser,
	getHistoryEntriesPageForUser,
	getHistoryPageDataForUser,
	getHistoryStatsForUser,
	importAnonymousProgressForUser,
} from "@/lib/puzzle-history.server";
export { publishLeaderboardForUser } from "@/lib/puzzle-leaderboard.server";
export {
	getWordCluesData,
	syncPuzzleEventsForUser,
} from "@/lib/puzzle-progress.server";
export { getUserPuzzleProgressData } from "@/lib/puzzle-progress-store.server";

function toSessionUser(
	sessionData: Awaited<ReturnType<typeof getAuthSession>>,
	profile?: {
		displayName: string | null;
		useGoogleAvatar: boolean;
	} | null,
): SessionUser {
	if (!sessionData) {
		return null;
	}
	const userRecord = {
		name: sessionData.user.name,
		displayName: profile?.displayName ?? null,
		image: sessionData.user.image,
		useGoogleAvatar: profile?.useGoogleAvatar ?? true,
	};
	return {
		id: sessionData.user.id,
		name: resolveDisplayName(userRecord),
		displayName: profile?.displayName ?? null,
		email: sessionData.user.email,
		image: resolveAvatarImage(userRecord),
		googleImage: sessionData.user.image ?? null,
		useGoogleAvatar: profile?.useGoogleAvatar ?? true,
	};
}

async function getUserProfileFields(userId: string) {
	const profiles = await db
		.select({
			displayName: user.displayName,
			useGoogleAvatar: user.useGoogleAvatar,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return profiles[0] ?? null;
}

async function toEnrichedSessionUser(
	sessionData: Awaited<ReturnType<typeof getAuthSession>>,
): Promise<SessionUser> {
	if (!sessionData) {
		return null;
	}
	const profile = await getUserProfileFields(sessionData.user.id);
	return toSessionUser(sessionData, profile);
}

export async function getAuthSession() {
	const headers = new Headers(getRequestHeaders());
	return auth.api.getSession({
		headers,
	});
}

export async function getDailyPuzzlePublicData(dateKey = getTodayDateKey()) {
	const puzzle = await readDailyPuzzleRow(dateKey);
	if (!puzzle) {
		throw new DailyPuzzleNotFoundError(dateKey);
	}

	const sessionData = await getAuthSession();
	const historyEntries = sessionData
		? await getHistoryEntriesForUser(sessionData.user.id)
		: null;
	const publicSnapshot = hydratePublicSnapshotWordMetadata({
		publicSnapshot: puzzle.publicSnapshotJson,
		privateSnapshot: puzzle.privateSnapshotJson,
	});
	const hintCapsules = await ensureHintCapsulesCoverGrid({
		puzzleId: publicSnapshot.id,
		seed: publicSnapshot.seed,
		gridLetters: puzzle.privateSnapshotJson.gridLetters,
		existingHintCapsules: publicSnapshot.hintCapsules,
	});

	return {
		historyEntries,
		puzzle: {
			...publicSnapshot,
			hintCapsules,
			validNormalizedGuesses: getDailyValidNormalizedGuesses(
				publicSnapshot.letters,
			),
			// The column is authoritative (kept in sync by generation and backfill);
			// fall back to the snapshot JSON for rows persisted before the column.
			difficulty: toPuzzleDifficulty(
				puzzle.difficulty ?? publicSnapshot.difficulty,
			),
		},
		rolloverAt: getNextRolloverAt().toISOString(),
		sessionUser: await toEnrichedSessionUser(sessionData),
	};
}

export async function getSessionUserData() {
	return toEnrichedSessionUser(await getAuthSession());
}

// Bumps the lifetime "clues given" counter shown on the profile, called whenever
// a signed-in player successfully answers someone else's clue request. Anonymous
// responders have no user row to credit, so callers only invoke this for known
// users (see handleRespond).
export async function incrementCluesGivenCount(userId: string): Promise<void> {
	await db
		.update(user)
		.set({ cluesGivenCount: sql`${user.cluesGivenCount} + 1` })
		.where(eq(user.id, userId));
}

export async function updateUserProfileData(input: {
	userId: string;
	displayName?: string;
	useGoogleAvatar?: boolean;
}) {
	const normalizedName =
		input.displayName === undefined
			? undefined
			: normalizeDisplayNameInput(input.displayName);

	if (input.displayName !== undefined && normalizedName === null) {
		throw new Error("Invalid display name");
	}

	const updates: {
		displayName?: string | null;
		useGoogleAvatar?: boolean;
	} = {};

	if (normalizedName !== undefined) {
		const profiles = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, input.userId))
			.limit(1);
		const oauthName = profiles[0]?.name.trim();
		const normalizedOauthName =
			(oauthName ? normalizeDisplayNameInput(oauthName) : null) ?? oauthName;
		updates.displayName =
			normalizedName && normalizedName !== normalizedOauthName
				? normalizedName
				: null;
	}

	if (input.useGoogleAvatar !== undefined) {
		updates.useGoogleAvatar = input.useGoogleAvatar;
	}

	if (Object.keys(updates).length === 0) {
		const profile = await db
			.select({
				name: user.name,
				displayName: user.displayName,
				image: user.image,
				useGoogleAvatar: user.useGoogleAvatar,
			})
			.from(user)
			.where(eq(user.id, input.userId))
			.limit(1);
		const saved = profile[0];
		if (!saved) {
			throw new Error("User not found");
		}
		return {
			displayName: saved.displayName,
			useGoogleAvatar: saved.useGoogleAvatar,
			name: resolveDisplayName(saved),
			image: resolveAvatarImage(saved),
		};
	}

	await db.update(user).set(updates).where(eq(user.id, input.userId));

	const profile = await db
		.select({
			name: user.name,
			displayName: user.displayName,
			image: user.image,
			useGoogleAvatar: user.useGoogleAvatar,
		})
		.from(user)
		.where(eq(user.id, input.userId))
		.limit(1);
	const saved = profile[0];
	if (!saved) {
		throw new Error("User not found");
	}

	try {
		await updateLeaderboardProfile({
			dateKey: getTodayDateKey(),
			participantId: userParticipantId(input.userId),
			name: leaderboardDisplayName(resolveDisplayName(saved)),
			image: resolveAvatarImage(saved),
		});
	} catch (error) {
		console.warn("[leaderboard] profile refresh failed", error);
	}

	return {
		displayName: saved.displayName,
		useGoogleAvatar: saved.useGoogleAvatar,
		name: resolveDisplayName(saved),
		image: resolveAvatarImage(saved),
	};
}

export async function decodeRevealedWords(
	puzzle: DailyPuzzlePublic,
	progress: PuzzleProgressState,
) {
	const entries = await Promise.all(
		puzzle.wordSlots
			.filter((slot) => progress.guessedWordIds.includes(slot.id))
			.map(async (slot) => {
				const unlockToken = progress.revealedWordTokens[String(slot.id)];
				if (!unlockToken) return null;
				return [
					slot.id,
					await openAnswerCapsule(slot.answerCapsule, unlockToken),
				] as const;
			}),
	);

	return Object.fromEntries(
		entries.filter(Boolean) as Array<readonly [number, string]>,
	);
}
