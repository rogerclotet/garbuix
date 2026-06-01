import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Seeds a fake peer clue request into Redis so you can test the responder side
// (header badge + word list) on your own, without a second real player.
//
// Usage:
//   pnpm seed:clue-request                 # today's puzzle, first word
//   pnpm seed:clue-request --word 3        # specific word id
//   pnpm seed:clue-request --name "Anna"   # who is asking
//   pnpm seed:clue-request --date 2026-05-31
//
// Requires Redis to be reachable (same REDIS_URL the dev server uses) and today's
// puzzle to exist (open the game once to create it).

// tsx does not load .env automatically (unlike the Nitro dev server), so do it
// here before importing anything that reads process.env at module load.
function loadDotEnv() {
	const path = resolve(process.cwd(), ".env");
	if (!existsSync(path)) return;
	for (const rawLine of readFileSync(path, "utf8").split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

loadDotEnv();
// Default to a local Redis so the script works out of the box once one is running.
process.env.REDIS_URL ??= "redis://localhost:6379";

function getArg(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
	const { eq } = await import("drizzle-orm");
	const { dailyPuzzles } = await import("@/db/schema");
	const { db, sql } = await import("@/lib/db");
	const { createClueRequest } = await import("@/lib/clue-request.server");
	const { isRedisConfigured } = await import("@/lib/redis.server");
	const { getTodayDateKey } = await import("@/lib/puzzle-dates");

	if (!isRedisConfigured()) {
		console.error(
			"REDIS_URL is not set. Start a local Redis and set REDIS_URL (e.g. redis://localhost:6379).",
		);
		process.exit(1);
	}

	const dateKey = getArg("--date") ?? getTodayDateKey();
	const requesterName = getArg("--name") ?? "Jugador de prova";
	const requesterId = getArg("--user") ?? `seed-${crypto.randomUUID().slice(0, 8)}`;

	const puzzle = await db.query.dailyPuzzles.findFirst({
		where: eq(dailyPuzzles.dateKey, dateKey),
	});
	if (!puzzle) {
		console.error(
			`No puzzle found for ${dateKey}. Open the game once to create today's puzzle, then retry.`,
		);
		process.exit(1);
	}

	const slots = puzzle.publicSnapshotJson.wordSlots;
	const wordIdArg = getArg("--word");
	const wordId = wordIdArg ? Number(wordIdArg) : slots[0]?.id;
	const slot = slots.find((s) => s.id === wordId);
	if (!slot) {
		console.error(
			`Word id ${wordId} not found. Available ids: ${slots.map((s) => s.id).join(", ")}`,
		);
		process.exit(1);
	}

	const request = await createClueRequest({
		dateKey,
		puzzleId: puzzle.id,
		wordId: slot.id,
		wordLength: slot.length,
		requesterId,
		requesterName,
	});

	if (!request) {
		console.error("Failed to create request (Redis unavailable?).");
		process.exit(1);
	}

	console.log(
		`Seeded clue request ${request.id}: "${requesterName}" asking for word ${slot.id} (${slot.length} letters) on ${dateKey}.`,
	);
	console.log(
		"Open the app as a logged-in user with the peer-clues flag on — you should see the header badge and the word in the list.",
	);

	await sql.end();
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
