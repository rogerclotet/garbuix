// Liang's weighted-pattern algorithm, using Catalan patterns from hyphen-ca.
// Work with syllables, not line wrapping: single-letter syllables are retained.
export function createSyllableSplitter(patterns: string[]) {
	const compiled = patterns.filter(Boolean).map((pattern) => {
		const start = pattern.startsWith(".");
		const end = pattern.endsWith(".");
		const body = pattern.replace(/^\.|\.$/g, "");
		let text = "";
		const weights = [0];
		for (const char of body) {
			if (/\d/.test(char)) weights[text.length] = Number(char);
			else {
				text += char;
				weights.push(0);
			}
		}
		return { text, weights, start, end };
	});
	return (word: string): string[] => {
		const lower = word.toLocaleLowerCase("ca").normalize("NFC");
		const levels: number[] = Array(lower.length + 1).fill(0);
		for (const pattern of compiled) {
			if (!pattern.text) continue;
			let offset = lower.indexOf(pattern.text);
			while (offset !== -1) {
				if (
					(!pattern.start || offset === 0) &&
					(!pattern.end || offset + pattern.text.length === lower.length)
				) {
					for (const [index, weight] of pattern.weights.entries()) {
						levels[offset + index] = Math.max(levels[offset + index], weight);
					}
				}
				offset = lower.indexOf(pattern.text, offset + 1);
			}
		}
		const syllables: string[] = [];
		let start = 0;
		for (let index = 1; index < lower.length; index++) {
			if (levels[index] % 2 === 1) {
				syllables.push(lower.slice(start, index));
				start = index;
			}
		}
		syllables.push(lower.slice(start));
		return syllables;
	};
}
