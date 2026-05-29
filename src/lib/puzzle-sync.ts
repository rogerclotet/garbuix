import { createUnlockToken } from "@/lib/puzzle-crypto";
import type {
	DailyPuzzlePrivate,
	DailyPuzzlePublic,
	PuzzleClientEvent,
} from "@/lib/puzzle-types";

type EventTypeCounts = Record<PuzzleClientEvent["type"], number>;

export type PuzzleSyncDiagnostics = {
	acceptedByType: EventTypeCounts;
	acceptedCount: number;
	duplicateInPayloadCount: number;
	existingOnServerCount: number;
	receivedByType: EventTypeCounts;
	receivedCount: number;
	sanitizedInvalidUnlockTokenCount: number;
	sanitizedMissingWordCount: number;
};

function createEmptyEventTypeCounts(): EventTypeCounts {
	return {
		guess_added: 0,
		hint_used: 0,
		text_hint_requested: 0,
		text_hint_fallback: 0,
		letters_shuffled: 0,
		progress_reset: 0,
	};
}

export async function filterSyncablePuzzleEvents(options: {
	events: PuzzleClientEvent[];
	existingEventIds: Set<string>;
	publicSnapshot: DailyPuzzlePublic;
	privateSnapshot: DailyPuzzlePrivate;
}) {
	const { events, existingEventIds, privateSnapshot, publicSnapshot } = options;
	const filteredEvents: PuzzleClientEvent[] = [];
	const seenEventIds = new Set<string>();
	const diagnostics: PuzzleSyncDiagnostics = {
		acceptedByType: createEmptyEventTypeCounts(),
		acceptedCount: 0,
		duplicateInPayloadCount: 0,
		existingOnServerCount: 0,
		receivedByType: createEmptyEventTypeCounts(),
		receivedCount: events.length,
		sanitizedInvalidUnlockTokenCount: 0,
		sanitizedMissingWordCount: 0,
	};

	for (const event of events) {
		diagnostics.receivedByType[event.type] += 1;

		if (existingEventIds.has(event.id)) {
			diagnostics.existingOnServerCount += 1;
			continue;
		}

		if (seenEventIds.has(event.id)) {
			diagnostics.duplicateInPayloadCount += 1;
			continue;
		}

		let acceptedEvent = event;

		if (event.type === "guess_added" && event.payload.matchedWordId != null) {
			const slot = publicSnapshot.wordSlots.find(
				(wordSlot) => wordSlot.id === event.payload.matchedWordId,
			);
			const privateWord = privateSnapshot.wordSlots.find(
				(wordSlot) => wordSlot.id === event.payload.matchedWordId,
			);

			if (!slot || !privateWord) {
				diagnostics.sanitizedMissingWordCount += 1;
				acceptedEvent = {
					...event,
					payload: {
						guessHash: event.payload.guessHash,
						matchedWordId: null,
						unlockToken: null,
					},
				};
			} else {
				const expectedUnlockToken = await createUnlockToken(
					slot.slotSalt,
					privateWord.normalizedWord,
				);
				if (event.payload.unlockToken !== expectedUnlockToken) {
					diagnostics.sanitizedInvalidUnlockTokenCount += 1;
					acceptedEvent = {
						...event,
						payload: {
							guessHash: event.payload.guessHash,
							matchedWordId: null,
							unlockToken: null,
						},
					};
				}
			}
		}

		filteredEvents.push(acceptedEvent);
		diagnostics.acceptedByType[event.type] += 1;
		diagnostics.acceptedCount += 1;
		seenEventIds.add(event.id);
	}

	return {
		diagnostics,
		filteredEvents,
	};
}

export function collectAckedEventIds(options: {
	existingEventIds: Set<string>;
	filteredEvents: PuzzleClientEvent[];
}) {
	return Array.from(
		new Set([
			...options.existingEventIds,
			...options.filteredEvents.map((event) => event.id),
		]),
	);
}
