import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { dailyPuzzles, userPuzzleProgress } from "@/db/schema";
import { validateClueText } from "@/lib/clue-fairness";
import {
	createClueRequest,
	getClueInbox,
	getClueRequest,
	getPendingClueRequests,
	hasActiveClueRequest,
	publishClueResponse,
	resolveClueRequest,
	resolveOwnClueRequestsForWord,
} from "@/lib/clue-request.server";
import {
	resolveClueRequestParticipant,
	type ClueRequestParticipant,
} from "@/lib/clue-request-participant.server";
import {
	clueRequestsChannel,
	clueResponsesChannel,
} from "@/lib/clue-request-types";
import { db } from "@/lib/db";
import { observeServerAction } from "@/lib/observability-server";
import { getRedisSub, isRedisConfigured } from "@/lib/redis.server";

export const Route = createFileRoute("/api/clue-requests/$")({
	server: {
		handlers: {
			GET: ({ request }) => handleGet(request),
			POST: ({ request }) => handlePost(request),
		},
	},
});

type ParsedPath =
	| { kind: "stream"; dateKey: string }
	| { kind: "inbox"; dateKey: string }
	| { kind: "request"; dateKey: string }
	| { kind: "respond"; dateKey: string }
	| { kind: "resolve"; dateKey: string }
	| { kind: "unknown" };

function parsePath(pathname: string): ParsedPath {
	const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
	const prefixIndex = segments.indexOf("clue-requests");
	if (prefixIndex === -1) {
		return { kind: "unknown" };
	}
	const rest = segments.slice(prefixIndex + 1);
	const dateKey = rest[0];
	if (!dateKey || rest.length !== 2) {
		return { kind: "unknown" };
	}
	if (rest[1] === "stream") return { kind: "stream", dateKey };
	if (rest[1] === "inbox") return { kind: "inbox", dateKey };
	if (rest[1] === "request") return { kind: "request", dateKey };
	if (rest[1] === "respond") return { kind: "respond", dateKey };
	if (rest[1] === "resolve") return { kind: "resolve", dateKey };
	return { kind: "unknown" };
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(dateKey: string): boolean {
	return dateKeyPattern.test(dateKey);
}

const anonAuthFields = {
	deviceId: z.string().min(1).max(128).optional(),
	name: z.string().min(1).max(48).optional(),
};

async function handleGet(request: Request) {
	const url = new URL(request.url);
	const parsed = parsePath(url.pathname);
	if (
		(parsed.kind !== "stream" && parsed.kind !== "inbox") ||
		!isValidDateKey(parsed.dateKey)
	) {
		return new Response("Not Found", { status: 404 });
	}
	const participant = await resolveClueRequestParticipant(request);
	if (!participant) {
		return new Response("Unauthorized", { status: 401 });
	}
	// Polling fallback for both directions, in case the live SSE event is dropped
	// (e.g. a proxy buffering the open stream in production): clues delivered to
	// the asker, plus the pending requests this user could still answer. Requests
	// exclude the viewer's own — same shape the SSE snapshot ships — so the client
	// can reconcile them and recover a missed "request" (or "resolved") event.
	if (parsed.kind === "inbox") {
		const [responses, pending] = await Promise.all([
			getClueInbox(participant.id, parsed.dateKey),
			getPendingClueRequests(parsed.dateKey),
		]);
		const requests = pending.filter(
			(r) => r.requesterId !== participant.id,
		);
		return Response.json(
			{ responses, requests },
			{ headers: { "Cache-Control": "no-store" } },
		);
	}
	return openSseStream(parsed.dateKey, participant.id);
}

const requestSchema = z.object({
	wordId: z.number().int().min(0),
	...anonAuthFields,
});

const respondSchema = z.object({
	requestId: z.string().min(1).max(128),
	text: z.string().min(1).max(280),
	...anonAuthFields,
});

const resolveSchema = z.object({
	wordId: z.number().int().min(0),
	...anonAuthFields,
});

async function handlePost(request: Request) {
	const url = new URL(request.url);
	const parsed = parsePath(url.pathname);
	if (
		(parsed.kind !== "request" &&
			parsed.kind !== "respond" &&
			parsed.kind !== "resolve") ||
		!isValidDateKey(parsed.dateKey)
	) {
		return new Response("Not Found", { status: 404 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return new Response("Invalid body", { status: 400 });
	}

	const participant = await resolveClueRequestParticipant(request, raw as {
		deviceId?: string;
		name?: string;
	});
	if (!participant) {
		return new Response("Unauthorized", { status: 401 });
	}

	if (parsed.kind === "request") {
		return observeServerAction("clue_request_create", () =>
			handleCreateRequest(parsed.dateKey, participant, raw),
		);
	}
	if (parsed.kind === "resolve") {
		return observeServerAction("clue_request_resolve", () =>
			handleResolve(parsed.dateKey, participant, raw),
		);
	}
	return observeServerAction("clue_request_respond", () =>
		handleRespond(parsed.dateKey, participant, raw),
	);
}

async function handleCreateRequest(
	dateKey: string,
	participant: ClueRequestParticipant,
	raw: unknown,
) {
	const result = requestSchema.safeParse(raw);
	if (!result.success) {
		return new Response("Invalid body", { status: 400 });
	}
	const { wordId } = result.data;

	const puzzle = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});
	if (!puzzle) {
		return new Response("Not Found", { status: 404 });
	}

	const slot = puzzle.publicSnapshotJson.wordSlots.find((s) => s.id === wordId);
	if (!slot) {
		return new Response("Unknown word", { status: 400 });
	}

	if (participant.kind === "user") {
		const progress = await db.query.userPuzzleProgress.findFirst({
			where: and(
				eq(userPuzzleProgress.puzzleId, puzzle.id),
				eq(userPuzzleProgress.userId, participant.id),
			),
		});
		if (progress?.guessedWordIds.includes(wordId)) {
			return new Response("Already found", { status: 409 });
		}
	}

	if (await hasActiveClueRequest(dateKey, participant.id, wordId)) {
		return Response.json({ created: false, reason: "duplicate" });
	}

	const created = await createClueRequest({
		dateKey,
		puzzleId: puzzle.id,
		wordId,
		wordLength: slot.length,
		requesterId: participant.id,
		requesterName: participant.name,
	});

	return Response.json({ created: Boolean(created) });
}

async function handleRespond(
	dateKey: string,
	participant: ClueRequestParticipant,
	raw: unknown,
) {
	const result = respondSchema.safeParse(raw);
	if (!result.success) {
		return new Response("Invalid body", { status: 400 });
	}
	const { requestId, text } = result.data;

	const clueRequest = await getClueRequest(dateKey, requestId);
	if (!clueRequest) {
		// The request is gone: the asker found the word, another responder answered
		// first (first-responder-wins resolves it), or it simply expired. In every
		// case the asker no longer needs this clue, so accept it silently and report
		// success — surfacing an error here only confuses a responder who did nothing
		// wrong. Nothing is delivered since there's no one waiting.
		return Response.json({ delivered: true });
	}

	// A player can't answer their own request.
	if (clueRequest.requesterId === participant.id) {
		return new Response("Cannot answer own request", { status: 400 });
	}

	const puzzle = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.id, clueRequest.puzzleId),
	});
	if (!puzzle) {
		return new Response("Not Found", { status: 404 });
	}

	const privateWord = puzzle.privateSnapshotJson.wordSlots.find(
		(s) => s.id === clueRequest.wordId,
	);
	if (!privateWord) {
		return new Response("Unknown word", { status: 400 });
	}

	const fairness = validateClueText(text, privateWord.normalizedWord);
	if (!fairness.ok) {
		return Response.json(
			{ delivered: false, reason: fairness.reason },
			{ status: 422 },
		);
	}

	await publishClueResponse({
		request: clueRequest,
		text,
		responderName: participant.name,
	});
	// First responder wins: clear the request so other helpers' badges/buttons
	// update live and the asker isn't flooded with duplicate clues.
	await resolveClueRequest(dateKey, clueRequest);

	return Response.json({ delivered: true });
}

async function handleResolve(
	dateKey: string,
	participant: ClueRequestParticipant,
	raw: unknown,
) {
	const result = resolveSchema.safeParse(raw);
	if (!result.success) {
		return new Response("Invalid body", { status: 400 });
	}
	// Only the asker can resolve their own request (e.g. they found the word).
	await resolveOwnClueRequestsForWord({
		dateKey,
		requesterId: participant.id,
		wordId: result.data.wordId,
	});
	return Response.json({ resolved: true });
}

const HEARTBEAT_INTERVAL_MS = 25_000;

function openSseStream(dateKey: string, userId: string): Response {
	if (!isRedisConfigured()) {
		const emptyStream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(
					encoder.encode(
						`event: snapshot\ndata: ${JSON.stringify({ dateKey, requests: [] })}\n\n`,
					),
				);
				controller.close();
			},
		});
		return new Response(emptyStream, { headers: sseHeaders() });
	}

	const sub = getRedisSub();
	const requestsChannelName = clueRequestsChannel(dateKey);
	const responsesChannelName = clueResponsesChannel(userId, dateKey);
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
				const [pending, responses] = await Promise.all([
					getPendingClueRequests(dateKey),
					getClueInbox(userId, dateKey),
				]);
				// Don't echo the viewer's own open requests back as actionable; ship
				// them separately so a reload restores the "waiting for help" state.
				// Replay any clues already delivered so a missed live event recovers.
				const requests = pending.filter((r) => r.requesterId !== userId);
				const ownRequests = pending.filter((r) => r.requesterId === userId);
				send(
					`event: snapshot\ndata: ${JSON.stringify({ dateKey, requests, ownRequests, responses })}\n\n`,
				);
			} catch (error) {
				console.warn("[clue-request:sse] initial snapshot failed", error);
				send(
					`event: snapshot\ndata: ${JSON.stringify({ dateKey, requests: [], responses: [] })}\n\n`,
				);
			}

			if (sub) {
				listener = (channel, message) => {
					if (
						channel === requestsChannelName ||
						channel === responsesChannelName
					) {
						send(`event: message\ndata: ${message}\n\n`);
					}
				};
				sub.on("message", listener);
				try {
					await sub.subscribe(requestsChannelName, responsesChannelName);
				} catch (error) {
					console.warn("[clue-request:sse] subscribe failed", error);
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

	return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
	return {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	};
}
