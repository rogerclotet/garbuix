import { createUnlockToken } from "@/lib/puzzle-crypto";
import type {
	DailyPuzzlePrivate,
	DailyPuzzlePublic,
	PuzzleClientEvent,
} from "@/lib/puzzle-types";

export async function filterSyncablePuzzleEvents(options: {
	events: PuzzleClientEvent[];
	existingEventIds: Set<string>;
	publicSnapshot: DailyPuzzlePublic;
	privateSnapshot: DailyPuzzlePrivate;
}) {
	const { events, existingEventIds, privateSnapshot, publicSnapshot } = options;
	const filteredEvents: PuzzleClientEvent[] = [];
	const seenEventIds = new Set<string>();

	for (const event of events) {
		if (existingEventIds.has(event.id) || seenEventIds.has(event.id)) {
			continue;
		}

		if (event.type === "guess_added" && event.payload.matchedWordId != null) {
			const slot = publicSnapshot.wordSlots.find(
				(wordSlot) => wordSlot.id === event.payload.matchedWordId,
			);
			const privateWord = privateSnapshot.wordSlots.find(
				(wordSlot) => wordSlot.id === event.payload.matchedWordId,
			);

			if (!slot || !privateWord) {
				continue;
			}

			const expectedUnlockToken = await createUnlockToken(
				slot.slotSalt,
				privateWord.normalizedWord,
			);
			if (event.payload.unlockToken !== expectedUnlockToken) {
				continue;
			}
		}

		filteredEvents.push(event);
		seenEventIds.add(event.id);
	}

	return filteredEvents;
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
