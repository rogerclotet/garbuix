/**
 * Backfill script for Better Auth 1.7 account identity migration.
 *
 * The drizzle migration 0007_better_auth_account_issuer.sql performs the same
 * backfill inline. Run this script only if you need to re-apply or verify the
 * issuer column on an existing database outside drizzle migrate.
 *
 * Usage: tsx scripts/backfill-account-issuer.ts
 */
import { sql } from "@/lib/db";

async function main() {
	const [{ count: missingCount }] = await sql<{ count: number }[]>`
		SELECT COUNT(*)::int AS count
		FROM account
		WHERE issuer IS NULL
	`;

	if (missingCount === 0) {
		console.log("All account rows already have an issuer.");
		return;
	}

	console.log(`Backfilling issuer for ${missingCount} account row(s)...`);

	await sql`
		UPDATE account
		SET issuer = 'local:oauth:' || provider_id
		WHERE issuer IS NULL AND provider_id <> 'credential'
	`;
	await sql`
		UPDATE account
		SET issuer = 'local:credential'
		WHERE issuer IS NULL AND provider_id = 'credential'
	`;

	const [{ count: remainingCount }] = await sql<{ count: number }[]>`
		SELECT COUNT(*)::int AS count
		FROM account
		WHERE issuer IS NULL
	`;

	if (remainingCount > 0) {
		throw new Error(
			`${remainingCount} account row(s) still missing issuer after backfill`,
		);
	}

	console.log("Account issuer backfill complete.");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
