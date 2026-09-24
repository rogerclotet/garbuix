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
import { dailyPuzzles, puzzleWordClues } from "@/db/schema";
import { db, sql } from "@/lib/db";
import { createEmptyProgressState } from "@/lib/puzzle-progress";
import {
	getUserPuzzleProgressData,
	getWordCluesData,
	importAnonymousProgressForUser,
} from "@/lib/puzzle-service.server";
import { buildPuzzleSnapshots } from "@/lib/puzzle-snapshot";
import type { PuzzleProgressState } from "@/lib/puzzle-types";

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
	},
);
