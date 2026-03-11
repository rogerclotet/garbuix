export function normalizeWord(word: string): string {
	return word
		.toLowerCase()
		.normalize("NFD")
		.replace(/c\u0327/g, "ç")
		.replace(/[\u0300-\u036f]/g, "")
		.normalize("NFC")
		.replace(/[·]/g, "");
}

export function formatGuess(word: string) {
	if (!word) return "";
	return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
}
