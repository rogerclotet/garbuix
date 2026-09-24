import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// Never fall back to the application's database or contact external services.
vi.hoisted(() => {
	vi.stubEnv(
		"DATABASE_URL",
		process.env.TEST_DATABASE_URL ?? "postgres://test:test@127.0.0.1:1/unused",
	);
	for (const key of ["REDIS_URL", "POSTHOG_KEY", "ANTHROPIC_API_KEY"]) {
		vi.stubEnv(key, "");
	}
});
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));

import { user } from "@/db/auth-schema";
import {
	dailyPuzzles,
	puzzleWordClues,
	userPuzzleEvents,
	userPuzzleProgress,
} from "@/db/schema";
import { db, sql } from "@/lib/db";
import { createUnlockToken, hashText } from "@/lib/puzzle-crypto";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import {
	getUserPuzzleProgressData,
	getWordCluesData,
	importAnonymousProgressForUser,
	syncPuzzleEventsForUser,
} from "@/lib/puzzle-service.server";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import type {
	GuessAddedEvent,
	PuzzleClientEvent,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"PostgreSQL puzzle persistence",
	() => {
		const fixtureIds: string[] = [];

		beforeAll(async () => {
			await migrate(db, { migrationsFolder: "./drizzle" });
		});

		afterEach(async () => {
			for (const id of fixtureIds.splice(0)) {
				await db.delete(user).where(eq(user.id, id));
				await db.delete(dailyPuzzles).where(eq(dailyPuzzles.id, id));
			}
		});

		afterAll(async () => {
			await sql.end();
			vi.unstubAllEnvs();
		});

		async function createFixture() {
			const id = crypto.randomUUID();
			fixtureIds.push(id);
			const dateKey = "2026-03-10";
			const words = ["casa", "sacs", "casc"];
			const snapshots = await buildPuzzleSnapshots({
				puzzleId: id,
				dateKey,
				seed: 123,
				algorithmVersion: "test",
				letters: ["c", "a", "s"],
				initialShuffledLetters: ["s", "a", "c"],
				availableWordCount: 3,
				crossword: {
					rows: 3,
					cols: 4,
					grid: words.map((word, id) =>
						[...word].map((letter) => ({ letter, wordIds: [id] })),
					),
					words: words.map((name, id) => ({
						id,
						word: { name, areatematica: "test", frequency: 1000 },
						startRow: id,
						startCol: 0,
						direction: "horizontal",
						revealed: false,
					})),
				},
			});
			await db
				.insert(user)
				.values({ id, name: "Test player", email: `${id}@example.test` });
			await db.insert(dailyPuzzles).values({
				id,
				dateKey,
				seed: 123,
				algorithmVersion: "test",
				dictionaryVersion: "test",
				wordCount: words.length,
				publicSnapshotJson: snapshots.publicSnapshot,
				privateSnapshotJson: snapshots.privateSnapshot,
			});
			await db.insert(puzzleWordClues).values(
				words.map((normalizedWord, wordId) => ({
					id: crypto.randomUUID(),
					puzzleId: id,
					wordId,
					normalizedWord,
					sonnetModel: "test",
					sonnetClue: `Clue ${wordId}`,
				})),
			);
			return { id, dateKey, ...snapshots };
		}

		async function importProgress(
			fixture: Awaited<ReturnType<typeof createFixture>>,
			progress: PuzzleProgressState,
		) {
			return importAnonymousProgressForUser({
				userId: fixture.id,
				anonDeviceId: null,
				payload: {
					historyEntries: [
						{
							dateKey: fixture.dateKey,
							seed: 123,
							totalWords: 3,
							guessedWords: progress.guessedWordIds.length,
							guessCount: progress.guessCount,
							hintsUsed: progress.hintsUsed,
							completed: progress.completedAt !== null,
							lastUpdated: "2026-03-10T12:00:00.000Z",
						},
					],
					activeProgressByDate: { [fixture.dateKey]: progress },
				},
			});
		}

		it("keeps a guest's unlocked clue available after signing in", async () => {
			const fixture = await createFixture();
			await importProgress(fixture, {
				...createEmptyProgressState(fixture.publicSnapshot),
				clueWordIds: [0],
				hintsUsed: 1,
			});
			expect(
				await getUserPuzzleProgressData(fixture.id, fixture.id),
			).toMatchObject({ clueWordIds: [0], hintsUsed: 1 });
			expect(
				await getWordCluesData({
					puzzleId: fixture.id,
					userId: fixture.id,
					wordIds: [0, 1],
				}),
			).toEqual({ 0: "Clue 0" });
		});

		it("merges newly imported clues with clues already saved on the account", async () => {
			const fixture = await createFixture();
			const initial = createEmptyProgressState(fixture.publicSnapshot);
			await importProgress(fixture, {
				...initial,
				clueWordIds: [0],
				hintsUsed: 1,
			});
			await importProgress(fixture, {
				...initial,
				clueWordIds: [1],
				hintsUsed: 2,
			});
			expect(
				await getUserPuzzleProgressData(fixture.id, fixture.id),
			).toMatchObject({ clueWordIds: [0, 1], hintsUsed: 2 });
			expect(
				await getWordCluesData({
					puzzleId: fixture.id,
					userId: fixture.id,
					wordIds: [0, 1, 2],
				}),
			).toEqual({ 0: "Clue 0", 1: "Clue 1" });
		});
		async function guess(
			fixture: Awaited<ReturnType<typeof createFixture>>,
			wordId: number,
		): Promise<GuessAddedEvent> {
			const slot = fixture.publicSnapshot.wordSlots[wordId];
			const word = fixture.privateSnapshot.wordSlots[wordId].normalizedWord;
			return {
				id: crypto.randomUUID(),
				at: "2026-03-10T12:00:00.000Z",
				type: "guess_added",
				payload: {
					guessHash: await hashText(word),
					matchedWordId: wordId,
					unlockToken: await createUnlockToken(slot.slotSalt, word),
				},
			};
		}

		function sync(
			fixture: Awaited<ReturnType<typeof createFixture>>,
			events: PuzzleClientEvent[],
			deviceId = "test-device",
		) {
			return syncPuzzleEventsForUser({
				puzzleId: fixture.id,
				userId: fixture.id,
				deviceId,
				events,
			});
		}

		async function seedProgress(
			fixture: Awaited<ReturnType<typeof createFixture>>,
			fields: Partial<typeof userPuzzleProgress.$inferInsert> = {},
		) {
			await db.insert(userPuzzleProgress).values({
				...fields,
				id: `${fixture.id}:${fixture.id}`,
				userId: fixture.id,
				puzzleId: fixture.id,
			});
		}

		// Hold the projection row until both requests are waiting in PostgreSQL.
		// The old implementation reads the same stale state before its upserts block.
		// A serialized implementation waits before the second read. No timing sleeps
		// or mocked database calls are needed to force this interleaving.
		async function overlap(
			fixture: Awaited<ReturnType<typeof createFixture>>,
			actions: Array<() => Promise<unknown>>,
		) {
			let settled: Promise<PromiseSettledResult<unknown>[]> = Promise.resolve(
				[],
			);
			try {
				await sql.begin(async (blocker) => {
					await blocker`select id from user_puzzle_progress where user_id = ${fixture.id} for update`;
					settled = Promise.allSettled(actions.map((action) => action()));
					await expect
						.poll(
							async () => {
								const [row] = await sql<{ waiting: number }[]>`
            select count(*)::int as waiting from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'
              and (query ilike '%user_puzzle_progress%' or query ilike '%pg_advisory_xact_lock%')
          `;
								return row.waiting;
							},
							{ timeout: 3000 },
						)
						.toBe(actions.length);
				});
			} finally {
				// Drain requests after releasing the blocker, even if the barrier fails.
				await settled;
			}
			for (const result of await settled) {
				if (result.status === "rejected") throw result.reason;
			}
		}

		it("preserves discoveries from overlapping devices and acknowledges retries", async () => {
			const fixture = await createFixture();
			await seedProgress(fixture);
			const first = await guess(fixture, 0);
			const second = await guess(fixture, 1);
			await overlap(fixture, [
				() => sync(fixture, [first], "phone"),
				() => sync(fixture, [second], "tablet"),
			]);
			const progress = await getUserPuzzleProgressData(fixture.id, fixture.id);
			expect(progress?.guessedWordIds.slice().sort()).toEqual([0, 1]);
			expect(progress?.guessCount).toBe(2);
			const retry = await sync(fixture, [first], "phone");
			expect(retry.ackedEventIds).toEqual([first.id]);
			expect(retry.progress.guessedWordIds.slice().sort()).toEqual([0, 1]);
			expect(
				await db.query.userPuzzleEvents.findMany({
					where: eq(userPuzzleEvents.userId, fixture.id),
				}),
			).toHaveLength(2);
		});

		it("keeps a concurrent guest import and a signed-in guess", async () => {
			const fixture = await createFixture();
			await seedProgress(fixture);
			const event = await guess(fixture, 0);
			await overlap(fixture, [
				() => sync(fixture, [event]),
				() =>
					importProgress(fixture, {
						...createEmptyProgressState(fixture.publicSnapshot),
						clueWordIds: [1],
						hintsUsed: 1,
					}),
			]);
			expect(
				await getUserPuzzleProgressData(fixture.id, fixture.id),
			).toMatchObject({ guessedWordIds: [0], clueWordIds: [1], hintsUsed: 1 });
		});

		it("admits only one concurrent hint when one remains in the budget", async () => {
			const fixture = await createFixture();
			await seedProgress(fixture, {
				hintsUsed: 2,
				hintedCells: ["0,0", "0,1"],
			});
			const hint = (cellKey: string): PuzzleClientEvent => ({
				id: crypto.randomUUID(),
				at: "2026-03-10T12:00:00.000Z",
				type: "hint_used",
				payload: { cellKey },
			});
			await overlap(fixture, [
				() => sync(fixture, [hint("1,0")], "phone"),
				() => sync(fixture, [hint("2,0")], "tablet"),
			]);
			const progress = await getUserPuzzleProgressData(fixture.id, fixture.id);
			expect(progress?.hintsUsed).toBe(3);
			expect(progress?.hintedCells).toHaveLength(3);
			expect(
				await db.query.userPuzzleEvents.findMany({
					where: eq(userPuzzleEvents.userId, fixture.id),
				}),
			).toHaveLength(1);
		});

		it("rolls back events if saving progress fails, allowing a complete retry", async () => {
			const fixture = await createFixture();
			const event = await guess(fixture, 0);
			// This disposable database constraint fails the projection write after the
			// event insert. Existing rows need not be validated for fault injection.
			await sql`alter table user_puzzle_progress add constraint test_reject_guesses check (guess_count = 0) not valid`;
			try {
				await expect(sync(fixture, [event])).rejects.toThrow();
				expect(
					await db.query.userPuzzleEvents.findMany({
						where: eq(userPuzzleEvents.userId, fixture.id),
					}),
				).toEqual([]);
				expect(
					await getUserPuzzleProgressData(fixture.id, fixture.id),
				).toBeNull();
			} finally {
				await sql`alter table user_puzzle_progress drop constraint test_reject_guesses`;
			}
			const retry = await sync(fixture, [event]);
			expect(retry.ackedEventIds).toEqual([event.id]);
			expect(retry.progress.guessedWordIds).toEqual([0]);
			expect(retry.progress.guessCount).toBe(1);
		});

		it("serializes the first syncs before a progress row exists", async () => {
			const fixture = await createFixture();
			const events = await Promise.all(
				[0, 1, 2].map((wordId) => guess(fixture, wordId)),
			);
			await Promise.all(
				events.map((event, index) => sync(fixture, [event], `device-${index}`)),
			);
			const progress = await getUserPuzzleProgressData(fixture.id, fixture.id);
			expect(progress?.guessedWordIds.slice().sort()).toEqual([0, 1, 2]);
			expect(progress?.guessCount).toBe(3);
			expect(progress?.completedAt).toBe("2026-03-10T12:00:00.000Z");
		});
		it("rebuilds saved hints before validating new events when the projection is missing", async () => {
			const fixture = await createFixture();
			const events: PuzzleClientEvent[] = [
				{
					id: crypto.randomUUID(),
					at: "2026-03-10T12:00:00.000Z",
					type: "text_hint_requested",
					payload: { wordId: 0 },
				},
				{
					id: crypto.randomUUID(),
					at: "2026-03-10T12:00:01.000Z",
					type: "text_hint_fallback",
					payload: { wordId: 0, cellKey: "0,0" },
				},
				{
					id: crypto.randomUUID(),
					at: "2026-03-10T12:00:02.000Z",
					type: "hint_used",
					payload: { cellKey: "1,0" },
				},
				{
					id: crypto.randomUUID(),
					at: "2026-03-10T12:00:03.000Z",
					type: "hint_used",
					payload: { cellKey: "2,0" },
				},
			];
			await sync(fixture, events);
			await db
				.delete(userPuzzleProgress)
				.where(eq(userPuzzleProgress.userId, fixture.id));
			const result = await sync(fixture, [
				{
					id: crypto.randomUUID(),
					at: "2026-03-10T12:00:04.000Z",
					type: "hint_used",
					payload: { cellKey: "1,1" },
				},
			]);
			expect(result.progress).toMatchObject({
				hintsUsed: 3,
				clueWordIds: [0],
				hintedCells: ["0,0", "1,0", "2,0"],
			});
			expect(result.ackedEventIds).toEqual([]);
			expect(
				await db.query.userPuzzleEvents.findMany({
					where: eq(userPuzzleEvents.userId, fixture.id),
				}),
			).toHaveLength(4);
		});
	},
);
