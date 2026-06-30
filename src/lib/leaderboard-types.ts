export type LeaderboardParticipantKind = "user" | "anon";

export type LeaderboardEntry = {
	participantId: string;
	kind: LeaderboardParticipantKind;
	name: string;
	image: string | null;
	wordsFound: number;
	totalWords: number;
	// Clues used while solving: the 3 free clues plus any a friend gave. Fewer
	// ranks higher on the leaderboard.
	clueCount: number;
	// Total guesses made. Breaks ties between players with equal clues: fewer
	// tries ranks higher.
	tryCount: number;
	completedAt: string | null;
	updatedAt: string;
};

export type LeaderboardSnapshot = {
	dateKey: string;
	entries: LeaderboardEntry[];
};

// Canonical leaderboard ordering, shared by the live ("same day") view and the
// historical ("previous day") view so a board never reorders between them.
// Mirrors the ranking tiers packed into the Redis sorted-set score: words found,
// then fewer clues, then fewer tries, then earlier completion, with updatedAt as
// a stable final tiebreak. Returns a new array; the input is left untouched.
export function sortLeaderboardEntries(
	entries: LeaderboardEntry[],
): LeaderboardEntry[] {
	return [...entries].sort((a, b) => {
		if (b.wordsFound !== a.wordsFound) {
			return b.wordsFound - a.wordsFound;
		}
		if (a.clueCount !== b.clueCount) {
			return a.clueCount - b.clueCount; // fewer clues ranks higher
		}
		if (a.tryCount !== b.tryCount) {
			return a.tryCount - b.tryCount; // fewer tries ranks higher
		}
		const aCompleted = a.completedAt ? new Date(a.completedAt).getTime() : null;
		const bCompleted = b.completedAt ? new Date(b.completedAt).getTime() : null;
		if (aCompleted && bCompleted) return aCompleted - bCompleted;
		if (aCompleted) return -1;
		if (bCompleted) return 1;
		return a.updatedAt.localeCompare(b.updatedAt);
	});
}

export type LeaderboardEventDelta = {
	wordsAdded: number;
	justCompleted: boolean;
};

export type LeaderboardEvent = {
	type: "update";
	dateKey: string;
	entry: LeaderboardEntry;
	delta: LeaderboardEventDelta;
};

export function userParticipantId(userId: string): string {
	return `user:${userId}`;
}

export function anonParticipantId(deviceId: string): string {
	return `anon:${deviceId}`;
}
