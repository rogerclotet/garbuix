export function normalizeWord(word: string): string {
	return word
		.toLowerCase()
		.normalize("NFD")
		.replace(/c\u0327/g, "ç")
		.replace(/[\u0300-\u036f]/g, "")
		.normalize("NFC")
		.replace(/[·]/g, "");
}

export function getPlayableWordLetters(word: string): string[] {
	const letters: string[] = [];

	for (const character of word) {
		if (character === "·") {
			continue;
		}

		if (normalizeWord(character).length === 1) {
			letters.push(character);
		}
	}

	return letters;
}

export function getWordLayout(word: string) {
	const normalizedWord = normalizeWord(word);
	const middleDotAfterIndices: number[] = [];
	let normalizedIndex = -1;

	for (const character of word) {
		if (character === "·") {
			if (normalizedIndex >= 0) {
				middleDotAfterIndices.push(normalizedIndex);
			}
			continue;
		}

		const normalizedCharacter = normalizeWord(character);
		if (normalizedCharacter.length === 1) {
			normalizedIndex += 1;
		}
	}

	return {
		letters: [...normalizedWord],
		length: normalizedWord.length,
		middleDotAfterIndices,
		normalizedWord,
	};
}

export function formatGuess(word: string) {
	if (!word) return "";
	return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
}
