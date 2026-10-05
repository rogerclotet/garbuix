export const MINI_MIN_WORD_LENGTH = 3;
export const MINI_MAX_WORD_LENGTH = 5;

export function isMiniWordLength(length: number) {
	return length >= MINI_MIN_WORD_LENGTH && length <= MINI_MAX_WORD_LENGTH;
}
