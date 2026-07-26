import {
	anonParticipantId,
	type LeaderboardEntry,
	type LeaderboardEvent,
	type LeaderboardEventDelta,
	type LeaderboardParticipantKind,
	type LeaderboardSnapshot,
	sortLeaderboardEntries,
	userParticipantId,
} from "@/lib/leaderboard-types";
import { getRedis, isRedisConfigured } from "@/lib/redis.server";

export { anonParticipantId, userParticipantId };

const TTL_SECONDS = 60 * 60 * 48;
// Ranking tiers, highest priority first, packed into a single sorted-set score:
//   1. words found  — each worth far more than any clue, try, or time delta
//   2. clues used   — fewer is better, so each clue subtracts a fixed amount
//   3. tries used   — fewer is better, breaking ties between equal clues
//   4. completion    — earlier finishers edge ahead, as a sub-1 tiebreak
// Each tier's band is wide enough to dominate every lower tier combined.
const WORDS_FOUND_MULTIPLIER = 1e12;
const CLUE_PENALTY = 1e8;
const TRY_PENALTY = 1e2;
const COMPLETION_HORIZON_MS = 1e14;

function scoreFor(
	wordsFound: number,
	clueCount: number,
	tryCount: number,
	completedAt: string | null,
): number {
	const base =
		wordsFound * WORDS_FOUND_MULTIPLIER -
		clueCount * CLUE_PENALTY -
		tryCount * TRY_PENALTY;
	if (!completedAt) {
		return base;
	}
	// Stays in [0, 1) so it only breaks ties between equal words, clues, and tries.
	const completionComponent = Math.max(
		0,
		1 - new Date(completedAt).getTime() / COMPLETION_HORIZON_MS,
	);
	return base + completionComponent;
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
	clueCount: number;
	tryCount: number;
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
	const score = scoreFor(
		input.wordsFound,
		input.clueCount,
		input.tryCount,
		input.completedAt,
	);

	const entry: LeaderboardEntry = {
		participantId: input.participantId,
		kind: input.kind,
		name: input.name,
		image: input.image,
		wordsFound: input.wordsFound,
		totalWords: input.totalWords,
		clueCount: input.clueCount,
		tryCount: input.tryCount,
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
		clueCount: String(entry.clueCount),
		tryCount: String(entry.tryCount),
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
	const clueCount = Number.parseInt(hash.clueCount ?? "0", 10);
	const tryCount = Number.parseInt(hash.tryCount ?? "0", 10);
	return {
		participantId,
		kind,
		name,
		image: hash.image && hash.image.length > 0 ? hash.image : null,
		wordsFound: Number.isFinite(wordsFound) ? wordsFound : 0,
		totalWords: Number.isFinite(totalWords) ? totalWords : 0,
		clueCount: Number.isFinite(clueCount) ? clueCount : 0,
		tryCount: Number.isFinite(tryCount) ? tryCount : 0,
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

	// Redis returns members in packed-score order, which can break ties (e.g.
	// players with equal words who haven't completed) differently than the live
	// client sort. Apply the shared canonical sort so the same board never
	// reorders between the same-day and previous-day views.
	return { dateKey, entries: sortLeaderboardEntries(entries) };
}

function writeLeaderboardEntry(
	pipeline: ReturnType<NonNullable<ReturnType<typeof getRedis>>["pipeline"]>,
	dateKey: string,
	entry: LeaderboardEntry,
): void {
	const score = scoreFor(
		entry.wordsFound,
		entry.clueCount,
		entry.tryCount,
		entry.completedAt,
	);
	const meta = metaKey(dateKey, entry.participantId);
	pipeline.hset(meta, {
		kind: entry.kind,
		name: entry.name,
		image: entry.image ?? "",
		wordsFound: String(entry.wordsFound),
		totalWords: String(entry.totalWords),
		clueCount: String(entry.clueCount),
		tryCount: String(entry.tryCount),
		completedAt: entry.completedAt ?? "",
		updatedAt: entry.updatedAt,
	});
	pipeline.expire(meta, TTL_SECONDS);
	pipeline.zadd(scoresKey(dateKey), score, entry.participantId);
	pipeline.expire(scoresKey(dateKey), TTL_SECONDS);
}

export async function mergeAnonLeaderboardEntry(options: {
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
	const toMeta = metaKey(options.dateKey, toId);

	try {
		const readPipeline = redis.pipeline();
		readPipeline.hgetall(fromMeta);
		readPipeline.hgetall(toMeta);
		const readResults = (await readPipeline.exec()) ?? [];
		const [, anonHash] = readResults[0] ?? [null, null];
		const [, userHash] = readResults[1] ?? [null, null];

		const anonEntry = parseMeta(
			fromId,
			anonHash && Object.keys(anonHash).length > 0
				? (anonHash as Record<string, string>)
				: null,
		);
		if (!anonEntry) {
			return;
		}

		const userEntry = parseMeta(
			toId,
			userHash && Object.keys(userHash).length > 0
				? (userHash as Record<string, string>)
				: null,
		);

		const updatedAt = new Date().toISOString();
		const mergedEntry: LeaderboardEntry = userEntry
			? {
					...sortLeaderboardEntries([anonEntry, userEntry])[0],
					participantId: toId,
					kind: "user",
					name: options.name,
					image: options.image,
					updatedAt,
				}
			: {
					...anonEntry,
					participantId: toId,
					kind: "user",
					name: options.name,
					image: options.image,
					updatedAt,
				};

		const writePipeline = redis.pipeline();
		writePipeline.del(fromMeta);
		writePipeline.zrem(scoresKey(options.dateKey), fromId);
		writeLeaderboardEntry(writePipeline, options.dateKey, mergedEntry);
		await writePipeline.exec();
	} catch (error) {
		console.warn("[leaderboard] mergeAnonLeaderboardEntry failed", error);
	}
}

export async function mergeAnonLeaderboardForUser(options: {
	deviceId: string;
	userId: string;
	name: string;
	image: string | null;
	dateKeys: string[];
}): Promise<void> {
	for (const dateKey of new Set(options.dateKeys)) {
		await mergeAnonLeaderboardEntry({
			dateKey,
			deviceId: options.deviceId,
			userId: options.userId,
			name: options.name,
			image: options.image,
		});
	}
}

export function leaderboardChannel(dateKey: string): string {
	return channel(dateKey);
}
