DROP TABLE "puzzle_word_clue_ratings" CASCADE;--> statement-breakpoint
ALTER TABLE "puzzle_word_clues" DROP COLUMN "haiku_model";--> statement-breakpoint
ALTER TABLE "puzzle_word_clues" DROP COLUMN "haiku_clue";