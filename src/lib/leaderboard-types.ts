export type LeaderboardParticipantKind = "user" | "anon";

export type LeaderboardEntry = {
	participantId: string;
	kind: LeaderboardParticipantKind;
	name: string;
	image: string | null;
	wordsFound: number;
	totalWords: number;
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
