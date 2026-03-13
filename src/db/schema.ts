import { relations, sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { account, session, user, verification } from "@/db/auth-schema";
import type {
	DailyPuzzlePrivate,
	DailyPuzzlePublic,
	HistorySummaryEntry,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

type StoredPuzzleEventPayload = Record<string, unknown>;

export const dailyPuzzles = pgTable(
	"daily_puzzles",
	{
		id: text("id").primaryKey(),
		dateKey: date("date_key").notNull(),
		seed: integer("seed").notNull(),
		algorithmVersion: text("algorithm_version").notNull(),
		dictionaryVersion: text("dictionary_version").notNull(),
		wordCount: integer("word_count").notNull(),
		publicSnapshotJson: jsonb("public_snapshot_json")
			.$type<DailyPuzzlePublic>()
			.notNull(),
		privateSnapshotJson: jsonb("private_snapshot_json")
			.$type<DailyPuzzlePrivate>()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("daily_puzzles_date_key_idx").on(table.dateKey),
		uniqueIndex("daily_puzzles_seed_idx").on(table.seed),
	],
);

export const userPuzzleProgress = pgTable(
	"user_puzzle_progress",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		puzzleId: text("puzzle_id")
			.notNull()
			.references(() => dailyPuzzles.id, { onDelete: "cascade" }),
		guessHashes: jsonb("guess_hashes")
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		guessedWordIds: jsonb("guessed_word_ids")
			.$type<number[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		revealedWordTokens: jsonb("revealed_word_tokens")
			.$type<Record<string, string>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		hintedCells: jsonb("hinted_cells")
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		hintsUsed: integer("hints_used").notNull().default(0),
		guessCount: integer("guess_count").notNull().default(0),
		shuffledLetters: jsonb("shuffled_letters")
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("user_puzzle_progress_user_puzzle_idx").on(
			table.userId,
			table.puzzleId,
		),
		index("user_puzzle_progress_user_idx").on(table.userId),
	],
);

export const userPuzzleEvents = pgTable(
	"user_puzzle_events",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		puzzleId: text("puzzle_id")
			.notNull()
			.references(() => dailyPuzzles.id, { onDelete: "cascade" }),
		deviceId: text("device_id").notNull(),
		clientEventId: text("client_event_id").notNull(),
		type: text("type").notNull(),
		payload: jsonb("payload").$type<StoredPuzzleEventPayload>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("user_puzzle_events_dedupe_idx").on(
			table.userId,
			table.puzzleId,
			table.deviceId,
			table.clientEventId,
		),
		index("user_puzzle_events_user_idx").on(table.userId),
	],
);

export const legacyImportedResults = pgTable(
	"legacy_imported_results",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		dateKey: date("date_key").notNull(),
		seed: integer("seed"),
		totalWords: integer("total_words").notNull(),
		guessedWords: integer("guessed_words").notNull(),
		guessCount: integer("guess_count").notNull(),
		hintsUsed: integer("hints_used").notNull(),
		completed: boolean("completed").notNull(),
		lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("legacy_imported_results_user_date_idx").on(
			table.userId,
			table.dateKey,
		),
		index("legacy_imported_results_user_idx").on(table.userId),
		index("legacy_imported_results_date_idx").on(table.dateKey),
	],
);

export const dailyPuzzleRelations = relations(dailyPuzzles, ({ many }) => ({
	progress: many(userPuzzleProgress),
	events: many(userPuzzleEvents),
}));

export const userPuzzleProgressRelations = relations(
	userPuzzleProgress,
	({ one }) => ({
		puzzle: one(dailyPuzzles, {
			fields: [userPuzzleProgress.puzzleId],
			references: [dailyPuzzles.id],
		}),
		player: one(user, {
			fields: [userPuzzleProgress.userId],
			references: [user.id],
		}),
	}),
);

export const userPuzzleEventsRelations = relations(
	userPuzzleEvents,
	({ one }) => ({
		puzzle: one(dailyPuzzles, {
			fields: [userPuzzleEvents.puzzleId],
			references: [dailyPuzzles.id],
		}),
		player: one(user, {
			fields: [userPuzzleEvents.userId],
			references: [user.id],
		}),
	}),
);

export const legacyImportedResultsRelations = relations(
	legacyImportedResults,
	({ one }) => ({
		player: one(user, {
			fields: [legacyImportedResults.userId],
			references: [user.id],
		}),
	}),
);

export const authSchema = {
	account,
	session,
	user,
	verification,
};

export const puzzleSchema = {
	dailyPuzzles,
	legacyImportedResults,
	userPuzzleEvents,
	userPuzzleProgress,
};

export type DbPuzzleProgressRow = typeof userPuzzleProgress.$inferSelect;
export type DbLegacyHistoryRow = typeof legacyImportedResults.$inferSelect;
export type DbHistoryRow = HistorySummaryEntry;
export type DbPuzzleProgress = PuzzleProgressState;
