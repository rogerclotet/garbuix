CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_puzzles" (
	"id" text PRIMARY KEY NOT NULL,
	"date_key" date NOT NULL,
	"seed" integer NOT NULL,
	"algorithm_version" text NOT NULL,
	"dictionary_version" text NOT NULL,
	"word_count" integer NOT NULL,
	"public_snapshot_json" jsonb NOT NULL,
	"private_snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_imported_results" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date_key" date NOT NULL,
	"seed" integer,
	"total_words" integer NOT NULL,
	"guessed_words" integer NOT NULL,
	"guess_count" integer NOT NULL,
	"hints_used" integer NOT NULL,
	"completed" boolean NOT NULL,
	"last_updated" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_puzzle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"puzzle_id" text NOT NULL,
	"device_id" text NOT NULL,
	"client_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_puzzle_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"puzzle_id" text NOT NULL,
	"guess_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guessed_word_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revealed_word_tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hinted_cells" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"guess_count" integer DEFAULT 0 NOT NULL,
	"shuffled_letters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_imported_results" ADD CONSTRAINT "legacy_imported_results_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_puzzle_events" ADD CONSTRAINT "user_puzzle_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_puzzle_events" ADD CONSTRAINT "user_puzzle_events_puzzle_id_daily_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."daily_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_puzzle_progress" ADD CONSTRAINT "user_puzzle_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_puzzle_progress" ADD CONSTRAINT "user_puzzle_progress_puzzle_id_daily_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."daily_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_puzzles_date_key_idx" ON "daily_puzzles" USING btree ("date_key");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_puzzles_seed_idx" ON "daily_puzzles" USING btree ("seed");--> statement-breakpoint
CREATE INDEX "legacy_imported_results_user_idx" ON "legacy_imported_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legacy_imported_results_date_idx" ON "legacy_imported_results" USING btree ("date_key");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_imported_results_user_date_idx" ON "legacy_imported_results" USING btree ("user_id","date_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_puzzle_events_dedupe_idx" ON "user_puzzle_events" USING btree ("user_id","puzzle_id","device_id","client_event_id");--> statement-breakpoint
CREATE INDEX "user_puzzle_events_user_idx" ON "user_puzzle_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_puzzle_progress_user_puzzle_idx" ON "user_puzzle_progress" USING btree ("user_id","puzzle_id");--> statement-breakpoint
CREATE INDEX "user_puzzle_progress_user_idx" ON "user_puzzle_progress" USING btree ("user_id");
