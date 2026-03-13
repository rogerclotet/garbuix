import { type CrosswordGrid, SeededRandom } from "@/lib/crossword-generator";
import {
	createAnswerHash,
	createUnlockToken,
	sealAnswerCapsule,
	sealHintCapsule,
} from "@/lib/puzzle-crypto";
import { normalizeWord } from "@/lib/puzzle-text";
import type {
	DailyPuzzleHintCapsule,
	DailyPuzzlePreview,
	DailyPuzzlePrivate,
	DailyPuzzlePublic,
} from "@/lib/puzzle-types";

function toGridMask(grid: CrosswordGrid["grid"]) {
	return grid.map((row) =>
		row.map((cell) => (cell ? { wordIds: [...cell.wordIds] } : null)),
	);
}

function toGridLetters(grid: CrosswordGrid["grid"]) {
	return grid.map((row) => row.map((cell) => cell?.letter ?? null));
}

function toHintCandidates(
	gridLetters: DailyPuzzlePrivate["gridLetters"],
	seed: number,
) {
	const random = new SeededRandom(seed + 97_331);
	const cells: Array<{ cellKey: string; letter: string }> = [];

	for (let row = 0; row < gridLetters.length; row += 1) {
		for (let col = 0; col < gridLetters[row].length; col += 1) {
			const letter = gridLetters[row][col];
			if (!letter) continue;
			cells.push({
				cellKey: `${row},${col}`,
				letter,
			});
		}
	}

	return random.shuffleArray(cells);
}

function createHintSalt(puzzleId: string, cellKey: string) {
	return `${puzzleId}:hint:${cellKey}`;
}

export async function ensureHintCapsulesCoverGrid(options: {
	puzzleId: string;
	seed: number;
	gridLetters: DailyPuzzlePrivate["gridLetters"];
	existingHintCapsules?: DailyPuzzleHintCapsule[];
}) {
	const { existingHintCapsules = [], gridLetters, puzzleId, seed } = options;
	const existingByCellKey = new Map(
		existingHintCapsules.map((capsule) => [capsule.cellKey, capsule]),
	);

	return Promise.all(
		toHintCandidates(gridLetters, seed).map(async ({ cellKey, letter }) => {
			const existing = existingByCellKey.get(cellKey);
			if (existing) {
				return existing;
			}

			const hintSalt = createHintSalt(puzzleId, cellKey);
			return {
				cellKey,
				hintSalt,
				hintCapsule: await sealHintCapsule(letter, hintSalt, cellKey),
			};
		}),
	);
}

export async function buildPuzzleSnapshots(options: {
	puzzleId: string;
	dateKey: string;
	seed: number;
	crossword: CrosswordGrid;
	letters: string[];
	initialShuffledLetters: string[];
	algorithmVersion: string;
}) {
	const {
		algorithmVersion,
		crossword,
		dateKey,
		initialShuffledLetters,
		letters,
		puzzleId,
		seed,
	} = options;
	const gridLetters = toGridLetters(crossword.grid);
	const wordSlotsPublic: DailyPuzzlePublic["wordSlots"] = [];
	const wordSlotsPrivate: DailyPuzzlePrivate["wordSlots"] = [];

	for (const wordPlacement of crossword.words) {
		const slotSalt = crypto.randomUUID();
		const normalizedWord = normalizeWord(wordPlacement.word.name);
		const answerHash = await createAnswerHash(slotSalt, normalizedWord);
		const unlockToken = await createUnlockToken(slotSalt, normalizedWord);
		const answerCapsule = await sealAnswerCapsule(
			wordPlacement.word.name,
			unlockToken,
		);

		wordSlotsPublic.push({
			id: wordPlacement.id,
			startRow: wordPlacement.startRow,
			startCol: wordPlacement.startCol,
			direction: wordPlacement.direction,
			length: wordPlacement.word.name.length,
			slotSalt,
			answerHash,
			answerCapsule,
		});

		wordSlotsPrivate.push({
			id: wordPlacement.id,
			displayWord: wordPlacement.word.name,
			normalizedWord,
			startRow: wordPlacement.startRow,
			startCol: wordPlacement.startCol,
			direction: wordPlacement.direction,
		});
	}

	const hintCapsules = await ensureHintCapsulesCoverGrid({
		puzzleId,
		seed,
		gridLetters,
	});

	const publicSnapshot: DailyPuzzlePublic = {
		id: puzzleId,
		dateKey,
		seed,
		algorithmVersion,
		rows: crossword.rows,
		cols: crossword.cols,
		gridMask: toGridMask(crossword.grid),
		letters,
		initialShuffledLetters,
		wordSlots: wordSlotsPublic,
		hintCapsules,
	};

	const privateSnapshot: DailyPuzzlePrivate = {
		id: puzzleId,
		dateKey,
		seed,
		rows: crossword.rows,
		cols: crossword.cols,
		gridLetters,
		letters,
		wordSlots: wordSlotsPrivate,
	};

	return { publicSnapshot, privateSnapshot };
}

export function toPuzzlePreview(
	privateSnapshot: DailyPuzzlePrivate,
): DailyPuzzlePreview {
	return {
		rows: privateSnapshot.rows,
		cols: privateSnapshot.cols,
		gridLetters: privateSnapshot.gridLetters,
	};
}
