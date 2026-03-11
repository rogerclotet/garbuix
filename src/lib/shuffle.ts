export function shuffleArray<T>(array: T[]) {
	const clone = [...array];
	for (let index = clone.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
	}
	return clone;
}
