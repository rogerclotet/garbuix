import {
	createAnswerHash,
	createUnlockToken,
	sealAnswerCapsule,
	sealHintCapsule,
} from "@/lib/puzzle-crypto";
import type { GeneratedQuadrat } from "@/lib/quadrat-generator";
import type {
	QuadratPuzzlePrivate,
	QuadratPuzzlePublic,
	QuadratWordSlot,
} from "@/lib/quadrat-types";

export function getStartCapsuleKey(slotId: number): string {
	return `start:${slotId}`;
}

export async function buildQuadratSnapshots(options: {
	puzzleId: string;
	dateKey: string;
	seed: number;
	algorithmVersion: string;
	generated: GeneratedQuadrat;
	validNormalizedGuesses: string[];
}): Promise<{
	publicSnapshot: QuadratPuzzlePublic;
	privateSnapshot: QuadratPuzzlePrivate;
}> {
	const { generated, puzzleId } = options;
	const wordSlots = await Promise.all(
		generated.words.map(
			async ({ id, word, normalizedWord, path }): Promise<QuadratWordSlot> => {
				const [first, second] = path;
				if (first === undefined || second === undefined) {
					throw new Error(`Quadrat word ${id} has a path shorter than two`);
				}
				const slotSalt = crypto.randomUUID();
				const unlockToken = await createUnlockToken(slotSalt, normalizedWord);
				const startSalt = `${puzzleId}:start:${id}`;
				return {
					id,
					length: path.length,
					slotSalt,
					answerHash: await createAnswerHash(slotSalt, normalizedWord),
					answerCapsule: await sealAnswerCapsule(word.name, unlockToken),
					startSalt,
					startCapsule: await sealHintCapsule(
						`${first},${second}`,
						startSalt,
						getStartCapsuleKey(id),
					),
				};
			},
		),
	);

	return {
		publicSnapshot: {
			id: puzzleId,
			dateKey: options.dateKey,
			seed: options.seed,
			algorithmVersion: options.algorithmVersion,
			letters: generated.letters,
			cellUses: generated.cellUses,
			connections: generated.connections,
			validNormalizedGuesses: options.validNormalizedGuesses,
			wordSlots,
		},
		privateSnapshot: {
			id: puzzleId,
			dateKey: options.dateKey,
			seed: options.seed,
			letters: generated.letters,
			words: generated.words.map(({ id, word, normalizedWord, path }) => ({
				id,
				displayWord: word.name,
				normalizedWord,
				path,
			})),
		},
	};
}
