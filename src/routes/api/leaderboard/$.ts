import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAnonSession, withAnonCookie } from "@/lib/anon-session.server";
import {
	anonParticipantId,
	getLeaderboard,
	leaderboardChannel,
	recordProgress,
	updateLeaderboardProfile,
} from "@/lib/leaderboard.server";
import { observeServerAction } from "@/lib/observability-server";
import {
	consumeRateLimit,
	getClientAddress,
	tooManyRequests,
} from "@/lib/rate-limit.server";
import { getRedisSub, isRedisConfigured } from "@/lib/redis.server";
import { normalizeDisplayNameInput } from "@/lib/user-profile";

export const Route = createFileRoute("/api/leaderboard/$")({
	server: {
		handlers: {
			GET: ({ request }) => handleGet(request),
			POST: ({ request }) => handlePost(request),
		},
	},
});

type ParsedPath =
	| { kind: "snapshot"; dateKey: string }
	| { kind: "stream"; dateKey: string }
	| { kind: "anon"; dateKey: string }
	| { kind: "anonProfile"; dateKey: string }
	| { kind: "unknown" };

function parsePath(pathname: string): ParsedPath {
	const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
	const prefixIndex = segments.indexOf("leaderboard");
	if (prefixIndex === -1) {
		return { kind: "unknown" };
	}
	const rest = segments.slice(prefixIndex + 1);
	const dateKey = rest[0];
	if (!dateKey) {
		return { kind: "unknown" };
	}
	if (rest.length === 1) {
		return { kind: "snapshot", dateKey };
	}
	if (rest.length === 2 && rest[1] === "stream") {
		return { kind: "stream", dateKey };
	}
	if (rest.length === 2 && rest[1] === "anon") {
		return { kind: "anon", dateKey };
	}
	if (rest.length === 3 && rest[1] === "anon" && rest[2] === "profile") {
		return { kind: "anonProfile", dateKey };
	}
	return { kind: "unknown" };
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(dateKey: string): boolean {
	return dateKeyPattern.test(dateKey);
}

async function handleGet(request: Request) {
	const url = new URL(request.url);
	const parsed = parsePath(url.pathname);
	if (parsed.kind === "unknown" || !isValidDateKey(parsed.dateKey)) {
		return new Response("Not Found", { status: 404 });
	}
	if (parsed.kind === "snapshot") {
		return observeServerAction("leaderboard_snapshot", async () => {
			const snapshot = await getLeaderboard(parsed.dateKey);
			return Response.json(snapshot, {
				headers: { "Cache-Control": "no-store" },
			});
		});
	}
	if (parsed.kind === "stream") {
		return openSseStream(parsed.dateKey);
	}
	return new Response("Method Not Allowed", { status: 405 });
}

// No deviceId: the participant is whoever holds the signed guest cookie, not
// whoever names an id in the body.
const anonSchema = z.object({
	name: z.string().min(1).max(48),
	wordsFound: z.number().int().min(0).max(200),
	totalWords: z.number().int().min(1).max(200),
	clueCount: z.number().int().min(0).max(500).optional(),
	tryCount: z.number().int().min(0).max(100000).optional(),
	completedAt: z.string().datetime().nullable().optional(),
	previousWordsFound: z.number().int().min(0).max(200).optional(),
	previousCompletedAt: z.string().datetime().nullable().optional(),
});

const anonProfileSchema = z.object({
	name: z.string().min(1).max(48),
});

function normalizeAnonLeaderboardName(name: string): string | null {
	return normalizeDisplayNameInput(name);
}

async function handlePost(request: Request) {
	const url = new URL(request.url);
	const parsed = parsePath(url.pathname);
	if (parsed.kind === "anonProfile" && isValidDateKey(parsed.dateKey)) {
		return handleAnonProfilePost(request, parsed.dateKey);
	}
	if (parsed.kind !== "anon" || !isValidDateKey(parsed.dateKey)) {
		return new Response("Not Found", { status: 404 });
	}

	return observeServerAction("leaderboard_anon", async () => {
		const session = resolveAnonSession(request);
		const participantId = anonParticipantId(session.deviceId);

		// Two buckets: one per guest, and one per address so discarding the cookie
		// to get a fresh identity doesn't reset the budget. A player reports after
		// every guess, so the per-guest limit sits well above real play.
		const limits = await Promise.all([
			consumeRateLimit({
				key: `lb:anon:${participantId}`,
				limit: 120,
				windowSeconds: 60,
			}),
			consumeRateLimit({
				key: `lb:anon:ip:${getClientAddress(request)}`,
				limit: 600,
				windowSeconds: 60,
			}),
		]);
		const exceeded = limits.find((limit) => !limit.allowed);
		if (exceeded) {
			return tooManyRequests(exceeded);
		}

		let raw: unknown;
		try {
			raw = await request.json();
		} catch {
			return new Response("Invalid body", { status: 400 });
		}
		const result = anonSchema.safeParse(raw);
		if (!result.success) {
			return new Response("Invalid body", { status: 400 });
		}
		const payload = result.data;
		const normalizedName = normalizeAnonLeaderboardName(payload.name);
		if (!normalizedName) {
			return new Response("Invalid body", { status: 400 });
		}
		const wordsFound = Math.min(payload.wordsFound, payload.totalWords);
		const completedAt =
			wordsFound >= payload.totalWords ? (payload.completedAt ?? null) : null;
		await recordProgress({
			dateKey: parsed.dateKey,
			participantId,
			kind: "anon",
			name: normalizedName,
			image: null,
			wordsFound,
			totalWords: payload.totalWords,
			clueCount: payload.clueCount ?? 0,
			tryCount: payload.tryCount ?? 0,
			completedAt,
			previousWordsFound: payload.previousWordsFound,
			previousCompletedAt: payload.previousCompletedAt ?? null,
		});
		// The id is public (it labels the guest's row on every viewer's board);
		// only the cookie's signature proves ownership of it. Returning it lets
		// the client highlight its own row without ever holding the credential.
		return withAnonCookie(
			Response.json({ recorded: true, participantId }),
			session.setCookie,
		);
	});
}

async function handleAnonProfilePost(request: Request, dateKey: string) {
	return observeServerAction("leaderboard_anon_profile", async () => {
		const session = resolveAnonSession(request);
		const participantId = anonParticipantId(session.deviceId);

		const rateLimit = await consumeRateLimit({
			key: `lb:anon-profile:${participantId}`,
			limit: 20,
			windowSeconds: 60,
		});
		if (!rateLimit.allowed) {
			return tooManyRequests(rateLimit);
		}

		let raw: unknown;
		try {
			raw = await request.json();
		} catch {
			return new Response("Invalid body", { status: 400 });
		}
		const result = anonProfileSchema.safeParse(raw);
		if (!result.success) {
			return new Response("Invalid body", { status: 400 });
		}
		const payload = result.data;
		const normalizedName = normalizeAnonLeaderboardName(payload.name);
		if (!normalizedName) {
			return new Response("Invalid body", { status: 400 });
		}
		await updateLeaderboardProfile({
			dateKey,
			participantId,
			name: normalizedName,
			image: null,
		});
		return withAnonCookie(
			Response.json({ updated: true, participantId }),
			session.setCookie,
		);
	});
}

const HEARTBEAT_INTERVAL_MS = 25_000;

function openSseStream(dateKey: string): Response {
	if (!isRedisConfigured()) {
		const emptyStream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(
					encoder.encode(
						`event: snapshot\ndata: ${JSON.stringify({ dateKey, entries: [] })}\n\n`,
					),
				);
				controller.close();
			},
		});
		return new Response(emptyStream, {
			headers: sseHeaders(),
		});
	}

	const sub = getRedisSub();
	const channelName = leaderboardChannel(dateKey);
	const encoder = new TextEncoder();
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let listener: ((channel: string, message: string) => void) | null = null;

	const stream = new ReadableStream({
		async start(controller) {
			const send = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// stream already closed
				}
			};

			try {
				const snapshot = await getLeaderboard(dateKey);
				send(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
			} catch (error) {
				console.warn("[leaderboard:sse] initial snapshot failed", error);
				send(
					`event: snapshot\ndata: ${JSON.stringify({ dateKey, entries: [] })}\n\n`,
				);
			}

			if (sub) {
				listener = (channel, message) => {
					if (channel === channelName) {
						send(`event: update\ndata: ${message}\n\n`);
					}
				};
				sub.on("message", listener);
				try {
					await sub.subscribe(channelName);
				} catch (error) {
					console.warn("[leaderboard:sse] subscribe failed", error);
				}
			}

			heartbeat = setInterval(() => {
				send(`: keep-alive ${Date.now()}\n\n`);
			}, HEARTBEAT_INTERVAL_MS);
		},
		cancel() {
			if (heartbeat) {
				clearInterval(heartbeat);
				heartbeat = null;
			}
			if (sub && listener) {
				sub.off("message", listener);
				listener = null;
			}
		},
	});

	return new Response(stream, {
		headers: sseHeaders(),
	});
}

function sseHeaders(): HeadersInit {
	return {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	};
}
