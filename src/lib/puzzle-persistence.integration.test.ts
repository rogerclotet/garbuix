import { and, eq } from "drizzle-orm";
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
	for (const key of ["REDIS_URL", "ANTHROPIC_API_KEY"]) {
		vi.stubEnv(key, "");
	}
});
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));

import { account, user } from "@/db/auth-schema";
import {
	dailyPuzzles,
	miniPuzzles,
	puzzleWordClues,
	syllablePuzzles,
	userPuzzleEvents,
	userPuzzleProgress,
} from "@/db/schema";
import { db, sql } from "@/lib/db";
import {
	ensureMiniPuzzle,
	getMiniHistory,
	getMiniProgress,
	saveMiniProgress,
} from "@/lib/mini.server";
import { getMiniDictionary } from "@/lib/mini-dictionary.server";
import {
	createGuessHash,
	createUnlockToken,
	hashText,
} from "@/lib/puzzle-crypto";
import { getHistoryEntriesForUser } from "@/lib/puzzle-history.server";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import {
	addPeerClueWordIds,
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
import {
	ensureSyllablePuzzle,
	getSyllableHistory,
	getSyllableProgress,
	saveSyllableProgress,
} from "@/lib/syllable.server";

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

		it("creates provider accounts and reads sessions with the real auth adapter", async () => {
			const { auth } = await vi.importActual<typeof import("./auth")>("./auth");
			const { internalAdapter } = await auth.$context;
			const createdUser = await internalAdapter.createUser(
				{
					name: "Auth migration test",
					email: `${crypto.randomUUID()}@example.test`,
				},
				{ method: "oauth", oauth: { providerId: "google" } },
			);
			fixtureIds.push(createdUser.id);
			const accountId = crypto.randomUUID();
			const createdAccount = await internalAdapter.createAccount({
				userId: createdUser.id,
				providerId: "google",
				accountId,
			});
			expect(
				await internalAdapter.findAccountByKey({
					providerId: "google",
					accountId,
				}),
			).toMatchObject({ id: createdAccount.id, userId: createdUser.id });
			// Accounts created before the upgrade retain issuer data and stay usable.
			const legacyAccountId = crypto.randomUUID();
			await db.insert(account).values({
				id: legacyAccountId,
				issuer: "local:oauth:google",
				providerId: "google",
				accountId: legacyAccountId,
				userId: createdUser.id,
			});
			expect(
				await internalAdapter.findAccountByKey({
					providerId: "google",
					accountId: legacyAccountId,
				}),
			).toMatchObject({ id: legacyAccountId, userId: createdUser.id });
			// The same subject is allowed at another provider, but never twice at one.
			await internalAdapter.createAccount({
				userId: createdUser.id,
				providerId: "github",
				accountId,
			});
			await expect(
				internalAdapter.createAccount({
					userId: createdUser.id,
					providerId: "google",
					accountId,
				}),
			).rejects.toMatchObject({ cause: { code: "23505" } });
			const createdSession = await internalAdapter.createSession(
				createdUser.id,
			);
			expect(
				await internalAdapter.findSession(createdSession.token),
			).toMatchObject({
				user: { id: createdUser.id },
				session: { id: createdSession.id },
			});
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
			peerClueWordIds: number[] = [],
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
					peerClueWordIdsByDate: { [fixture.dateKey]: peerClueWordIds },
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

		it("counts each friend clue once in history and keeps them across syncs", async () => {
			const fixture = await createFixture();
			await importProgress(fixture, {
				...createEmptyProgressState(fixture.publicSnapshot),
				clueWordIds: [0],
				hintsUsed: 1,
			});
			const delivery = { userId: fixture.id, puzzleId: fixture.id };
			await addPeerClueWordIds({ ...delivery, wordIds: [2] });
			// A second friend answering the same word replaces the inbox entry.
			await addPeerClueWordIds({ ...delivery, wordIds: [2] });
			await Promise.all([
				addPeerClueWordIds({ ...delivery, wordIds: [1] }),
				addPeerClueWordIds({ ...delivery, wordIds: [0] }),
			]);
			await importProgress(fixture, {
				...createEmptyProgressState(fixture.publicSnapshot),
				clueWordIds: [0],
				hintsUsed: 1,
				guessCount: 2,
			});

			const [row] = await db
				.select({ peerClueWordIds: userPuzzleProgress.peerClueWordIds })
				.from(userPuzzleProgress)
				.where(eq(userPuzzleProgress.userId, fixture.id));
			expect(row?.peerClueWordIds).toEqual([0, 1, 2]);
			expect(await getHistoryEntriesForUser(fixture.id)).toEqual([
				expect.objectContaining({ dateKey: fixture.dateKey, hintsUsed: 4 }),
			]);
		});

		it("brings a guest's friend clues into the account on sign-in", async () => {
			const fixture = await createFixture();
			await importProgress(
				fixture,
				{
					...createEmptyProgressState(fixture.publicSnapshot),
					hintsUsed: 3,
				},
				[1],
			);
			await addPeerClueWordIds({
				userId: fixture.id,
				puzzleId: fixture.id,
				wordIds: [1, 2],
			});

			expect(await getHistoryEntriesForUser(fixture.id)).toEqual([
				expect.objectContaining({ dateKey: fixture.dateKey, hintsUsed: 5 }),
			]);
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

		it("earns bonus reveals only from real extra words, one per five", async () => {
			const fixture = await createFixture();
			await seedProgress(fixture, { bonusWordsFound: 4 });
			const bonusGuess = async (word: string): Promise<PuzzleClientEvent> => ({
				id: crypto.randomUUID(),
				at: "2026-03-10T12:00:00.000Z",
				type: "guess_added",
				payload: {
					guessHash: await createGuessHash(fixture.id, word),
					matchedWordId: null,
					unlockToken: null,
					validNotInPuzzle: true,
				},
			});
			const reveal = (cellKey: string): PuzzleClientEvent => ({
				id: crypto.randomUUID(),
				at: "2026-03-10T12:01:00.000Z",
				type: "bonus_clue_revealed",
				payload: { cellKey },
			});

			const fake = await sync(fixture, [
				await bonusGuess("zzzz"),
				reveal("1,0"),
			]);
			expect(fake.progress.bonusWordsFound).toBe(4);
			expect(fake.progress.hintedCells).toEqual([]);

			const earned = await sync(fixture, [
				await bonusGuess("saca"),
				reveal("1,0"),
			]);
			expect(earned.progress.bonusWordsFound).toBe(5);
			expect(earned.progress.hintedCells).toEqual(["1,0"]);

			const extra = await sync(fixture, [reveal("2,0")], "tablet");
			expect(extra.progress.hintedCells).toEqual(["1,0"]);
			expect(
				await db.query.userPuzzleEvents.findMany({
					where: and(
						eq(userPuzzleEvents.userId, fixture.id),
						eq(userPuzzleEvents.type, "bonus_clue_revealed"),
					),
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
		it("merges Mini extras across devices, validates their counts, and freezes completed games", async () => {
			const fixture = await createFixture();
			const [mini, sameMini] = await Promise.all([
				ensureMiniPuzzle("2026-03-09"),
				ensureMiniPuzzle("2026-03-09"),
			]);
			expect(mini.publicSnapshotJson).toEqual(sameMini.publicSnapshotJson);
			try {
				const puzzle = mini.publicSnapshotJson;
				const empty = createEmptyProgressState(puzzle);
				const before = await getHistoryEntriesForUser(fixture.id);
				const targets = new Set(
					mini.privateSnapshotJson.wordSlots.map((word) => word.normalizedWord),
				);
				const extras = getMiniDictionary(
					puzzle.letters,
				).validNormalizedGuesses.filter((word) => !targets.has(word));
				const shortExtra = extras.find((word) => word.length === 3);
				const longExtra = extras.find((word) => word.length === 5);
				if (!shortExtra || !longExtra)
					throw new Error("Missing Mini test extras");
				const firstExtraHash = await createGuessHash(puzzle.id, shortExtra);
				const secondExtraHash = await createGuessHash(puzzle.id, longExtra);
				const tooShortHash = await createGuessHash(
					puzzle.id,
					puzzle.letters[0].repeat(2),
				);
				const tooLongHash = await createGuessHash(
					puzzle.id,
					puzzle.letters[0].repeat(6),
				);
				const answers = await Promise.all(
					puzzle.wordSlots.map(async (slot) => {
						const answer = mini.privateSnapshotJson.wordSlots.find(
							(word) => word.id === slot.id,
						);
						if (!answer) throw new Error("Missing test answer");
						return [
							String(slot.id),
							await createUnlockToken(slot.slotSalt, answer.normalizedWord),
						] as const;
					}),
				);
				await Promise.all([
					saveMiniProgress(fixture.id, {
						...empty,
						guessedWordIds: [0, 1],
						revealedWordTokens: Object.fromEntries(answers.slice(0, 2)),
						guessHashes: [
							"first",
							"second",
							firstExtraHash,
							firstExtraHash,
							tooShortHash,
							tooLongHash,
						],
						bonusWordsFound: 999,
						hintedCells: puzzle.hintCapsules
							.slice(0, 5)
							.map((cell) => cell.cellKey),
					}),
					saveMiniProgress(fixture.id, {
						...empty,
						guessedWordIds: [2, 3, 4],
						revealedWordTokens: Object.fromEntries(answers.slice(2)),
						guessHashes: ["third", "fourth", "fifth", secondExtraHash],
						hintedCells: puzzle.hintCapsules
							.slice(3, 7)
							.map((cell) => cell.cellKey),
					}),
				]);
				const saved = await getMiniProgress(fixture.id, puzzle.id);
				expect(saved?.guessedWordIds).toHaveLength(5);
				expect(saved?.guessCount).toBe(9);
				expect(saved?.bonusWordsFound).toBe(2);
				expect(
					await saveMiniProgress(fixture.id, {
						...empty,
						guessHashes: ["late-extra"],
					}),
				).toEqual(saved);
				expect(saved?.hintsUsed).toBe(7);
				expect(saved?.completedAt).not.toBeNull();
				expect(await getMiniHistory(fixture.id)).toEqual([
					expect.objectContaining({
						totalWords: 5,
						guessedWords: 5,
						hintsUsed: 7,
						completed: true,
					}),
				]);
				expect(await getHistoryEntriesForUser(fixture.id)).toEqual(before);
				expect(await getMiniProgress("another-user", puzzle.id)).toBeNull();
				await expect(
					saveMiniProgress(fixture.id, { ...empty, puzzleId: fixture.id }),
				).rejects.toThrow("Mini puzzle not found");
			} finally {
				await db.delete(miniPuzzles).where(eq(miniPuzzles.id, mini.id));
			}
		});
		it("merges Syllable across devices without touching Mini or regular history, and freezes completed games", async () => {
			const fixture = await createFixture();
			const [syllable, sameSyllable] = await Promise.all([
				ensureSyllablePuzzle("2026-03-09"),
				ensureSyllablePuzzle("2026-03-09"),
			]);
			expect(syllable.publicSnapshotJson).toEqual(
				sameSyllable.publicSnapshotJson,
			);
			try {
				const puzzle = syllable.publicSnapshotJson;
				const empty = createEmptyProgressState(puzzle);
				const before = await getHistoryEntriesForUser(fixture.id);
				const miniBefore = await getMiniHistory(fixture.id);
				const targetWords = new Set(
					syllable.privateSnapshotJson.wordSlots.map(
						(word) => word.normalizedWord,
					),
				);
				const extra = puzzle.validNormalizedGuesses.find(
					(word) => !targetWords.has(word),
				);
				if (!extra) throw new Error("Missing test extra");
				const bonusHash = await createGuessHash(puzzle.id, extra);
				const answers = await Promise.all(
					puzzle.wordSlots.map(async (slot) => {
						const answer = syllable.privateSnapshotJson.wordSlots.find(
							(word) => word.id === slot.id,
						);
						if (!answer) throw new Error("Missing test answer");
						return [
							String(slot.id),
							await createUnlockToken(slot.slotSalt, answer.normalizedWord),
						] as const;
					}),
				);
				await Promise.all([
					saveSyllableProgress(fixture.id, {
						...empty,
						guessedWordIds: [0, 1],
						revealedWordTokens: Object.fromEntries(answers.slice(0, 2)),
						guessHashes: ["first", "second", bonusHash],
						bonusWordsFound: 999,
						hintedCells: puzzle.hintCapsules
							.slice(0, 5)
							.map((cell) => cell.cellKey),
					}),
					saveSyllableProgress(fixture.id, {
						...empty,
						guessedWordIds: [2, 3, 4],
						revealedWordTokens: Object.fromEntries(answers.slice(2)),
						guessHashes: ["third", "fourth", "fifth"],
						hintedCells: puzzle.hintCapsules
							.slice(3, 7)
							.map((cell) => cell.cellKey),
					}),
				]);
				const saved = await getSyllableProgress(fixture.id, puzzle.id);
				expect(saved?.guessedWordIds).toHaveLength(5);
				expect(saved?.guessCount).toBe(6);
				expect(saved?.bonusWordsFound).toBe(1);
				expect(await getMiniHistory(fixture.id)).toEqual(miniBefore);
				expect(
					await saveSyllableProgress(fixture.id, {
						...empty,
						guessHashes: ["late-guess"],
					}),
				).toEqual(saved);
				expect(saved?.hintsUsed).toBe(7);
				expect(saved?.completedAt).not.toBeNull();
				expect(await getSyllableHistory(fixture.id)).toEqual([
					expect.objectContaining({
						totalWords: 5,
						guessedWords: 5,
						hintsUsed: 7,
						completed: true,
					}),
				]);
				expect(await getHistoryEntriesForUser(fixture.id)).toEqual(before);
				expect(await getSyllableProgress("another-user", puzzle.id)).toBeNull();
				await expect(
					saveSyllableProgress(fixture.id, { ...empty, puzzleId: fixture.id }),
				).rejects.toThrow("Syllable puzzle not found");
			} finally {
				await db
					.delete(syllablePuzzles)
					.where(eq(syllablePuzzles.id, syllable.id));
			}
		});
	},
);
