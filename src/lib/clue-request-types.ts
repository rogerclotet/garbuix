// Shared types and Redis key helpers for peer clue requests. A player who is out
// of hints can ask other connected players for a clue about a specific unfound
// word; responders get a real-time toast and reply with text.
// The answer itself never travels in these payloads — fairness validation runs
// server-side against the private snapshot before a response is delivered.

export type ClueRequest = {
	id: string;
	dateKey: string;
	puzzleId: string;
	wordId: number;
	wordLength: number;
	requesterId: string;
	requesterName: string;
	createdAt: string;
};

export type ClueResponse = {
	requestId: string;
	wordId: number;
	text: string;
	responderName: string;
	at: string;
};

export type ClueRequestStreamEvent =
	| { type: "request"; request: ClueRequest }
	| { type: "response"; response: ClueResponse }
	// A request no longer needs answering — it was helped, or the asker found the
	// word. Responders drop it from their badge/list on receipt.
	| { type: "resolved"; requestId: string; wordId: number };

// All connected players on a given puzzle receive new requests on this channel.
export function clueRequestsChannel(dateKey: string): string {
	return `clreq:${dateKey}:requests`;
}

// Responses are delivered to a single asker on their personal channel, scoped to
// the puzzle day so a clue for one day's word can't surface on the next day's
// puzzle (a responder lingering on yesterday's board past rollover would
// otherwise push a live clue onto the asker's same-numbered word today).
export function clueResponsesChannel(userId: string, dateKey: string): string {
	return `clreq:user:${userId}:${dateKey}:responses`;
}

// Hash of currently-pending requests for a puzzle, used to seed the SSE snapshot
// so a player who just connected still sees an open request. Entries are pruned
// once they pass the short advertise TTL, so this only ever holds requests still
// worth showing to responders.
export function pendingRequestsKey(dateKey: string): string {
	return `clreq:${dateKey}:pending`;
}

// Durable per-request record, retained for the full inbox window (24h) rather
// than the short advertise TTL. Lets a responder's clue still be validated and
// delivered to the asker's inbox even after the request stopped being advertised
// (the asker went offline, the pending entry aged out, or a poll pruned it) —
// without this, a clue sent a moment too late is silently lost. Keyed by request
// id, removed on resolve so first-responder-wins and "asker found it" still stop
// further delivery.
export function clueRequestRecordsKey(dateKey: string): string {
	return `clreq:${dateKey}:records`;
}

// Per-user, per-day store of clues received by the asker. Persisted so the clue
// survives an SSE reconnect: it's replayed in the asker's snapshot rather than
// relying solely on the live pub/sub event reaching them.
export function clueInboxKey(userId: string, dateKey: string): string {
	return `clreq:user:${userId}:${dateKey}:inbox`;
}

// DOM id of the word list section, so the header help badge can scroll to it.
export const WORD_LIST_SECTION_ID = "word-list-section";

// DOM id of a single word row, so the help badge can scroll straight to the
// requested word (handling the word list's own inner scroll on desktop).
export function wordRowId(wordId: number): string {
	return `word-row-${wordId}`;
}
