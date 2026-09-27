-- Better Auth 1.7.3+ identifies accounts by provider and account ID again.
-- Fail on duplicate identities before relaxing the legacy constraints.
-- Keep existing issuer values; new account inserts no longer supply one.
CREATE UNIQUE INDEX "account_provider_id_account_id_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
DROP INDEX "account_issuer_account_id_uidx";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
