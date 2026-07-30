ALTER TABLE "user" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "use_google_avatar" boolean DEFAULT true NOT NULL;
