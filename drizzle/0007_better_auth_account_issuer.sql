-- Better Auth 1.7: add issuer-scoped account identity (provider-id strategy).
-- Run only after stopping auth writers. Rehearse on a backup before production.
-- See: https://better-auth.com/docs/guides/1-7-upgrade-guide

ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account"
SET "issuer" = 'local:oauth:' || "provider_id"
WHERE "provider_id" <> 'credential';--> statement-breakpoint
UPDATE "account"
SET "issuer" = 'local:credential'
WHERE "provider_id" = 'credential';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_uidx" ON "account" USING btree ("issuer","account_id");
