CREATE TABLE "quadrat_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"puzzle_id" text NOT NULL,
	"progress_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quadrat_puzzles" (
	"id" text PRIMARY KEY NOT NULL,
	"date_key" date NOT NULL,
	"public_snapshot_json" jsonb NOT NULL,
	"private_snapshot_json" jsonb NOT NULL,
	CONSTRAINT "quadrat_puzzles_date_key_unique" UNIQUE("date_key")
);
--> statement-breakpoint
CREATE TABLE "quadrat_word_clues" (
	"id" text PRIMARY KEY NOT NULL,
	"puzzle_id" text NOT NULL,
	"word_id" integer NOT NULL,
	"normalized_word" text NOT NULL,
	"model" text NOT NULL,
	"clue" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quadrat_progress" ADD CONSTRAINT "quadrat_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quadrat_progress" ADD CONSTRAINT "quadrat_progress_puzzle_id_quadrat_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."quadrat_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quadrat_word_clues" ADD CONSTRAINT "quadrat_word_clues_puzzle_id_quadrat_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."quadrat_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quadrat_progress_user_puzzle_idx" ON "quadrat_progress" USING btree ("user_id","puzzle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quadrat_word_clues_puzzle_word_idx" ON "quadrat_word_clues" USING btree ("puzzle_id","word_id");