import {
	anonParticipantId,
	type LeaderboardEntry,
	type LeaderboardEvent,
	type LeaderboardEventDelta,
	type LeaderboardParticipantKind,
	type LeaderboardSnapshot,
	userParticipantId,
} from "@/lib/leaderboard-types";
import { getRedis, isRedisConfigured } from "@/lib/redis.server";

export { anonParticipantId, userParticipantId };

const TTL_SECONDS = 60 * 60 * 48;
const WORDS_FOUND_MULTIPLIER = 1e13;
const COMPLETION_HORIZON_MS = 1e13;

function scoreFor(wordsFound: number, completedAt: string | null): number {
	const wordsComponent = wordsFound * WORDS_FOUND_MULTIPLIER;
	if (!completedAt) {
		return wordsComponent;
	}
	const completionMs = new Date(completedAt).getTime();
	const completionComponent = Math.max(0, COMPLETION_HORIZON_MS - completionMs);
	return wordsComponent + completionComponent;
}

function scoresKey(dateKey: string): string {
	return `lb:${dateKey}:scores`;
}

function metaKey(dateKey: string, participantId: string): string {
	return `lb:${dateKey}:meta:${participantId}`;
}

function channel(dateKey: string): string {
	return `lb:${dateKey}:events`;
}

type RecordProgressInput = {
	dateKey: string;
	participantId: string;
	kind: LeaderboardParticipantKind;
	name: string;
	image: string | null;
	wordsFound: number;
	totalWords: number;
	completedAt: string | null;
	previousWordsFound?: number;
	previousCompletedAt?: string | null;
};

export type RecordProgressResult = {
	recorded: boolean;
	entry: LeaderboardEntry | null;
	delta: LeaderboardEventDelta;
};

export async function recordProgress(
	input: RecordProgressInput,
): Promise<RecordProgressResult> {
	const delta: LeaderboardEventDelta = {
		wordsAdded: Math.max(0, input.wordsFound - (input.previousWordsFound ?? 0)),
		justCompleted: Boolean(input.completedAt && !input.previousCompletedAt),
	};

	if (!isRedisConfigured()) {
		return { recorded: false, entry: null, delta };
	}

	const redis = getRedis();
	if (!redis) {
		return { recorded: false, entry: null, delta };
	}

	const updatedAt = new Date().toISOString();
	const score = scoreFor(input.wordsFound, input.completedAt);

	const entry: LeaderboardEntry = {
		participantId: input.participantId,
		kind: input.kind,
		name: input.name,
		image: input.image,
		wordsFound: input.wordsFound,
		totalWords: input.totalWords,
		completedAt: input.completedAt,
		updatedAt,
	};

	const meta = metaKey(input.dateKey, input.participantId);
	const scores = scoresKey(input.dateKey);

	const pipeline = redis.pipeline();
	pipeline.hset(meta, {
		kind: entry.kind,
		name: entry.name,
		image: entry.image ?? "",
		wordsFound: String(entry.wordsFound),
		totalWords: String(entry.totalWords),
		completedAt: entry.completedAt ?? "",
		updatedAt: entry.updatedAt,
	});
	pipeline.expire(meta, TTL_SECONDS);
	pipeline.zadd(scores, score, input.participantId);
	pipeline.expire(scores, TTL_SECONDS);

	try {
		await pipeline.exec();
	} catch (error) {
		console.warn("[leaderboard] failed to record progress", error);
		return { recorded: false, entry: null, delta };
	}

	if (delta.wordsAdded > 0 || delta.justCompleted) {
		const event: LeaderboardEvent = {
			type: "update",
			dateKey: input.dateKey,
			entry,
			delta,
		};
		try {
			await redis.publish(channel(input.dateKey), JSON.stringify(event));
		} catch (error) {
			console.warn("[leaderboard] failed to publish event", error);
		}
	}

	return { recorded: true, entry, delta };
}

function parseMeta(
	participantId: string,
	hash: Record<string, string> | null,
): LeaderboardEntry | null {
	if (!hash) {
		return null;
	}
	const kind = hash.kind as LeaderboardParticipantKind | undefined;
	if (kind !== "user" && kind !== "anon") {
		return null;
	}
	const name = hash.name ?? "";
	if (!name) {
		return null;
	}
	const wordsFound = Number.parseInt(hash.wordsFound ?? "0", 10);
	const totalWords = Number.parseInt(hash.totalWords ?? "0", 10);
	return {
		participantId,
		kind,
		name,
		image: hash.image && hash.image.length > 0 ? hash.image : null,
		wordsFound: Number.isFinite(wordsFound) ? wordsFound : 0,
		totalWords: Number.isFinite(totalWords) ? totalWords : 0,
		completedAt:
			hash.completedAt && hash.completedAt.length > 0 ? hash.completedAt : null,
		updatedAt: hash.updatedAt ?? new Date(0).toISOString(),
	};
}

export async function getLeaderboard(
	dateKey: string,
): Promise<LeaderboardSnapshot> {
	if (!isRedisConfigured()) {
		return { dateKey, entries: [] };
	}
	const redis = getRedis();
	if (!redis) {
		return { dateKey, entries: [] };
	}

	let participantIds: string[];
	try {
		participantIds = await redis.zrevrange(scoresKey(dateKey), 0, -1);
	} catch (error) {
		console.warn("[leaderboard] zrevrange failed", error);
		return { dateKey, entries: [] };
	}

	if (participantIds.length === 0) {
		return { dateKey, entries: [] };
	}

	const pipeline = redis.pipeline();
	for (const participantId of participantIds) {
		pipeline.hgetall(metaKey(dateKey, participantId));
	}

	let results: [Error | null, Record<string, string>][] = [];
	try {
		const execResult = (await pipeline.exec()) ?? [];
		results = execResult as [Error | null, Record<string, string>][];
	} catch (error) {
		console.warn("[leaderboard] hgetall pipeline failed", error);
		return { dateKey, entries: [] };
	}

	const entries: LeaderboardEntry[] = [];
	for (const [index, participantId] of participantIds.entries()) {
		const [error, hash] = results[index] ?? [null, null];
		if (error) {
			continue;
		}
		const parsed = parseMeta(participantId, hash ?? null);
		if (parsed) {
			entries.push(parsed);
		}
	}

	return { dateKey, entries };
}

export async function renameAnonToUser(options: {
	dateKey: string;
	deviceId: string;
	userId: string;
	name: string;
	image: string | null;
}): Promise<void> {
	if (!isRedisConfigured()) {
		return;
	}
	const redis = getRedis();
	if (!redis) {
		return;
	}

	const fromId = anonParticipantId(options.deviceId);
	const toId = userParticipantId(options.userId);
	const fromMeta = metaKey(options.dateKey, fromId);
	const toMeta = metaKey(options.dateKey, options.userId);

	try {
		const hash = await redis.hgetall(fromMeta);
		const parsed = parseMeta(fromId, Object.keys(hash).length ? hash : null);
		if (!parsed) {
			return;
		}

		const updated: LeaderboardEntry = {
			...parsed,
			participantId: toId,
			kind: "user",
			name: options.name,
			image: options.image,
		};

		const score = scoreFor(updated.wordsFound, updated.completedAt);
		const pipeline = redis.pipeline();
		pipeline.del(fromMeta);
		pipeline.zrem(scoresKey(options.dateKey), fromId);
		pipeline.hset(toMeta, {
			kind: updated.kind,
			name: updated.name,
			image: updated.image ?? "",
			wordsFound: String(updated.wordsFound),
			totalWords: String(updated.totalWords),
			completedAt: updated.completedAt ?? "",
			updatedAt: new Date().toISOString(),
		});
		pipeline.expire(toMeta, TTL_SECONDS);
		pipeline.zadd(scoresKey(options.dateKey), score, toId);
		pipeline.expire(scoresKey(options.dateKey), TTL_SECONDS);
		await pipeline.exec();
	} catch (error) {
		console.warn("[leaderboard] renameAnonToUser failed", error);
	}
}

export function leaderboardChannel(dateKey: string): string {
	return channel(dateKey);
}
