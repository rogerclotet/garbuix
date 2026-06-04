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
	// Total guesses made. Shown for context but never affects ranking.
	tryCount: number;
	completedAt: string | null;
	updatedAt: string;
};

export type LeaderboardSnapshot = {
	dateKey: string;
	entries: LeaderboardEntry[];
};

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
