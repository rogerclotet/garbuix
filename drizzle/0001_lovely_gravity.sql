CREATE TABLE "puzzle_word_clue_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"clue_id" text NOT NULL,
	"model" text NOT NULL,
	"rating" text NOT NULL,
	"rated_by_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puzzle_word_clues" (
	"id" text PRIMARY KEY NOT NULL,
	"puzzle_id" text NOT NULL,
	"word_id" integer NOT NULL,
	"normalized_word" text NOT NULL,
	"sonnet_model" text NOT NULL,
	"sonnet_clue" text NOT NULL,
	"haiku_model" text NOT NULL,
	"haiku_clue" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_puzzle_progress" ADD COLUMN "clue_word_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "puzzle_word_clue_ratings" ADD CONSTRAINT "puzzle_word_clue_ratings_clue_id_puzzle_word_clues_id_fk" FOREIGN KEY ("clue_id") REFERENCES "public"."puzzle_word_clues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puzzle_word_clues" ADD CONSTRAINT "puzzle_word_clues_puzzle_id_daily_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."daily_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "puzzle_word_clue_ratings_unique_idx" ON "puzzle_word_clue_ratings" USING btree ("clue_id","model","rated_by_email");--> statement-breakpoint
CREATE INDEX "puzzle_word_clue_ratings_clue_idx" ON "puzzle_word_clue_ratings" USING btree ("clue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "puzzle_word_clues_puzzle_word_idx" ON "puzzle_word_clues" USING btree ("puzzle_id","word_id");--> statement-breakpoint
CREATE INDEX "puzzle_word_clues_puzzle_idx" ON "puzzle_word_clues" USING btree ("puzzle_id");