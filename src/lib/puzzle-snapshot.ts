import { type CrosswordGrid, SeededRandom } from "@/lib/crossword-generator";
import {
	createAnswerHash,
	createUnlockToken,
	sealAnswerCapsule,
	sealHintCapsule,
} from "@/lib/puzzle-crypto";
import { normalizeWord } from "@/lib/puzzle-text";
import type {
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

function toHintCandidates(crossword: CrosswordGrid, seed: number) {
	const random = new SeededRandom(seed + 97_331);
	const cells: Array<{ cellKey: string; letter: string }> = [];

	for (let row = 0; row < crossword.grid.length; row += 1) {
		for (let col = 0; col < crossword.grid[row].length; col += 1) {
			const cell = crossword.grid[row][col];
			if (!cell) continue;
			cells.push({
				cellKey: `${row},${col}`,
				letter: cell.letter,
			});
		}
	}

	return random.shuffleArray(cells).slice(0, Math.min(12, cells.length));
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

	const hintCapsules = await Promise.all(
		toHintCandidates(crossword, seed).map(async ({ cellKey, letter }) => {
			const hintSalt = crypto.randomUUID();
			return {
				cellKey,
				hintSalt,
				hintCapsule: await sealHintCapsule(letter, hintSalt, cellKey),
			};
		}),
	);

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
		gridLetters: toGridLetters(crossword.grid),
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
