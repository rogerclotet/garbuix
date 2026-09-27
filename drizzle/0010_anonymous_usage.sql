CREATE TABLE "usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"event" text NOT NULL,
	"page" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"count" bigint DEFAULT 1 NOT NULL,
	"exported" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "usage_daily_bucket_idx" ON "usage_daily" USING btree ("day","event","page","value");