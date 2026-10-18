import {
	QUADRAT_CELL_COUNT,
	QUADRAT_SIZE,
	type QuadratPuzzlePublic,
} from "@/lib/quadrat-types";

export type QuadratBoardState = {
	cellUses: number[];
	// Remaining uses keyed by connectionKey.
	connectionUses: Map<string, number>;
};

export function getCellRow(cell: number): number {
	return Math.floor(cell / QUADRAT_SIZE);
}

export function getCellCol(cell: number): number {
	return cell % QUADRAT_SIZE;
}

// Horizontal, vertical and diagonal neighbours.
export function areAdjacent(left: number, right: number): boolean {
	if (left === right) return false;
	return (
		Math.abs(getCellRow(left) - getCellRow(right)) <= 1 &&
		Math.abs(getCellCol(left) - getCellCol(right)) <= 1
	);
}

export const QUADRAT_NEIGHBORS: readonly (readonly number[])[] = Array.from(
	{ length: QUADRAT_CELL_COUNT },
	(_, cell) =>
		Array.from({ length: QUADRAT_CELL_COUNT }, (_, other) => other).filter(
			(other) => areAdjacent(cell, other),
		),
);

export function connectionKey(left: number, right: number): string {
	return left < right ? `${left}-${right}` : `${right}-${left}`;
}

export function getPathConnectionKeys(path: readonly number[]): string[] {
	return path
		.slice(1)
		.map((cell, index) => connectionKey(path[index] as number, cell));
}

export function getWordFromPath(
	letters: readonly string[],
	path: readonly number[],
): string {
	return path.map((cell) => letters[cell] ?? "").join("");
}

// Every path through distinct, neighbouring cells that spells the word.
export function findWordPaths(
	letters: readonly string[],
	normalizedWord: string,
): number[][] {
	const paths: number[][] = [];
	const target = [...normalizedWord];
	const path: number[] = [];
	const used = new Array<boolean>(QUADRAT_CELL_COUNT).fill(false);

	const visit = (cell: number) => {
		if (used[cell] || letters[cell] !== target[path.length]) return;
		used[cell] = true;
		path.push(cell);
		if (path.length === target.length) {
			paths.push([...path]);
		} else {
			for (const next of QUADRAT_NEIGHBORS[cell] ?? []) visit(next);
		}
		path.pop();
		used[cell] = false;
	};

	for (let cell = 0; cell < QUADRAT_CELL_COUNT; cell++) visit(cell);
	return paths;
}

// Counts and connections left once the found words stop using them.
export function getRemainingBoard(
	puzzle: Pick<QuadratPuzzlePublic, "cellUses" | "connections">,
	foundPaths: readonly (readonly number[])[],
): QuadratBoardState {
	const cellUses = [...puzzle.cellUses];
	const connectionUses = new Map(
		puzzle.connections.map(({ cells: [left, right], uses }) => [
			connectionKey(left, right),
			uses,
		]),
	);

	for (const path of foundPaths) {
		for (const cell of path) {
			cellUses[cell] = Math.max(0, (cellUses[cell] ?? 0) - 1);
		}
		for (const key of getPathConnectionKeys(path)) {
			connectionUses.set(key, Math.max(0, (connectionUses.get(key) ?? 0) - 1));
		}
	}

	return { cellUses, connectionUses };
}

export function isCellAvailable(
	board: QuadratBoardState,
	cell: number,
): boolean {
	return (board.cellUses[cell] ?? 0) > 0;
}

export function isConnectionAvailable(
	board: QuadratBoardState,
	left: number,
	right: number,
): boolean {
	return (board.connectionUses.get(connectionKey(left, right)) ?? 0) > 0;
}

// A drag starts on any cell still in use and moves only along drawn
// connections into cells it has not visited yet.
export function canExtendPath(
	board: QuadratBoardState,
	path: readonly number[],
	cell: number,
): boolean {
	if (!isCellAvailable(board, cell) || path.includes(cell)) return false;
	const last = path.at(-1);
	if (last === undefined) return true;
	return areAdjacent(last, cell) && isConnectionAvailable(board, last, cell);
}
