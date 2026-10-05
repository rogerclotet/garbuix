CREATE TABLE "syllable_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"puzzle_id" text NOT NULL,
	"progress_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllable_puzzles" (
	"id" text PRIMARY KEY NOT NULL,
	"date_key" date NOT NULL,
	"public_snapshot_json" jsonb NOT NULL,
	"private_snapshot_json" jsonb NOT NULL,
	CONSTRAINT "syllable_puzzles_date_key_unique" UNIQUE("date_key")
);
--> statement-breakpoint
ALTER TABLE "syllable_progress" ADD CONSTRAINT "syllable_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllable_progress" ADD CONSTRAINT "syllable_progress_puzzle_id_syllable_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."syllable_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "syllable_progress_user_puzzle_idx" ON "syllable_progress" USING btree ("user_id","puzzle_id");