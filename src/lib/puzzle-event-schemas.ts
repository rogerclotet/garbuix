import { z } from "zod";
import type {
	AnonymousImportPayload,
	PuzzleClientEvent,
} from "@/lib/puzzle-types";

// Runtime schemas for the two payloads clients POST wholesale. Both used to be
// declared as `z.custom<T>()`, which — with no predicate — validates nothing:
// the handler received whatever JSON was sent, read fields off shapes it had
// never checked, and persisted event payloads verbatim into jsonb.
//
// Zod strips unknown keys, so parsing also sanitizes: only the fields below
// reach the database.

// Generous but bounded. Real syncs carry a handful of events; the cap stops one
// request from inserting an unbounded batch.
const MAX_EVENTS_PER_SYNC = 500;
const MAX_ID_LENGTH = 64;
const MAX_HASH_LENGTH = 128;
// "row,col" for a grid at most 15x15.
const MAX_CELL_KEY_LENGTH = 16;
const MAX_WORD_ID = 10_000;

const eventIdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const eventAtSchema = z.string().datetime();
const cellKeySchema = z.string().min(1).max(MAX_CELL_KEY_LENGTH);
const wordIdSchema = z.number().int().min(0).max(MAX_WORD_ID);
const hashSchema = z.string().min(1).max(MAX_HASH_LENGTH);

const puzzleClientEventSchema = z.discriminatedUnion("type", [
	z.object({
		id: eventIdSchema,
		at: eventAtSchema,
		type: z.literal("guess_added"),
		payload: z.object({
			guessHash: hashSchema,
			matchedWordId: wordIdSchema.nullable(),
			unlockToken: hashSchema.nullable(),
			validNotInPuzzle: z.boolean().optional(),
		}),
	}),
	z.object({
		id: eventIdSchema,
		at: eventAtSchema,
		type: z.literal("hint_used"),
		payload: z.object({ cellKey: cellKeySchema }),
	}),
	z.object({
		id: eventIdSchema,
		at: eventAtSchema,
		type: z.literal("text_hint_requested"),
		payload: z.object({ wordId: wordIdSchema }),
	}),
	z.object({
		id: eventIdSchema,
		at: eventAtSchema,
		type: z.literal("text_hint_fallback"),
		payload: z.object({ wordId: wordIdSchema, cellKey: cellKeySchema }),
	}),
	z.object({
		id: eventIdSchema,
		at: eventAtSchema,
		type: z.literal("bonus_clue_revealed"),
		payload: z.object({ cellKey: cellKeySchema }),
	}),
	z.object({
		id: eventIdSchema,
		at: eventAtSchema,
		type: z.literal("letters_shuffled"),
		payload: z.object({
			shuffledLetters: z.array(z.string().min(1).max(4)).max(32),
		}),
	}),
	z.object({
		id: eventIdSchema,
		at: eventAtSchema,
		type: z.literal("progress_reset"),
		payload: z.object({}),
	}),
]);

export const puzzleClientEventsSchema = z
	.array(puzzleClientEventSchema)
	.max(MAX_EVENTS_PER_SYNC);

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const historySummaryEntrySchema = z.object({
	dateKey: dateKeySchema,
	seed: z.number().int().nullable(),
	totalWords: z.number().int().min(0).max(200),
	guessedWords: z.number().int().min(0).max(200),
	guessCount: z.number().int().min(0).max(100_000),
	hintsUsed: z.number().int().min(0).max(1000),
	completed: z.boolean(),
	lastUpdated: z.string().min(1).max(64),
	legacy: z.boolean().optional(),
	difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullish(),
});

const progressStateSchema = z.object({
	puzzleId: z.string().min(1).max(MAX_ID_LENGTH),
	guessHashes: z.array(hashSchema).max(100_000),
	guessedWordIds: z.array(wordIdSchema).max(200),
	revealedWordTokens: z.record(z.string().max(16), hashSchema),
	hintedCells: z.array(cellKeySchema).max(500),
	clueWordIds: z.array(wordIdSchema).max(200),
	hintsUsed: z.number().int().min(0).max(1000),
	guessCount: z.number().int().min(0).max(100_000),
	bonusWordsFound: z.number().int().min(0).max(100_000),
	shuffledLetters: z.array(z.string().min(1).max(4)).max(32),
	completedAt: z.string().max(64).nullable(),
	lastSyncedAt: z.string().max(64).nullable(),
});

// A whole browser's local history, imported once when a guest signs in.
export const anonymousImportPayloadSchema = z.object({
	historyEntries: z.array(historySummaryEntrySchema).max(2000),
	activeProgressByDate: z.record(dateKeySchema, progressStateSchema),
});

// Keeps the schemas honest against the hand-written types they parse into: if a
// field is added to either type without being added here, this stops compiling.
type ParsedEvent = z.infer<typeof puzzleClientEventsSchema>[number];
type ParsedImport = z.infer<typeof anonymousImportPayloadSchema>;

const _eventsMatchType: PuzzleClientEvent = null as unknown as ParsedEvent;
const _importMatchesType: AnonymousImportPayload =
	null as unknown as ParsedImport;
void _eventsMatchType;
void _importMatchesType;
