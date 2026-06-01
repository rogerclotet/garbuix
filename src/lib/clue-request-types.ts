// Shared types and Redis key helpers for peer clue requests. A logged-in player
// who is out of hints can ask other connected players for a clue about a
// specific unfound word; responders get a real-time toast and reply with text.
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

// Responses are delivered to a single asker on their personal channel.
export function clueResponsesChannel(userId: string): string {
	return `clreq:user:${userId}:responses`;
}

// Hash of currently-pending requests for a puzzle, used to seed the SSE snapshot
// so a player who just connected still sees an open request.
export function pendingRequestsKey(dateKey: string): string {
	return `clreq:${dateKey}:pending`;
}

// DOM id of the word list section, so the header help badge can scroll to it.
export const WORD_LIST_SECTION_ID = "word-list-section";
