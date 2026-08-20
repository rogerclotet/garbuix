import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getSlotCellKey } from "./daily-helpers";

// Redesigned board sizing: the cell is derived from the box the grid lives in,
// on both axes at once, so a tall puzzle and a wide one both fill the space they
// are given instead of overflowing it or leaving a band of dead space.
const FITTED_GAP = 4;
const FITTED_MAX_CELL = 52;
// Below this the letters stop being readable. The floor only applies when height
// is the binding constraint: a board too wide for the screen has to shrink,
// because scrolling a crossword sideways is worse than smaller letters.
const FITTED_MIN_CELL = 21;

type FittedSize = { cell: number; needsScroll: boolean };

function fitCell(
	box: { width: number; height: number },
	rows: number,
	cols: number,
): FittedSize {
	const byWidth = (box.width - FITTED_GAP * (cols - 1)) / cols;
	const byHeight = (box.height - FITTED_GAP * (rows - 1)) / rows;
	const fitted = Math.max(0, Math.min(byWidth, byHeight, FITTED_MAX_CELL));

	if (fitted > 0 && byHeight < byWidth && fitted < FITTED_MIN_CELL) {
		return { cell: Math.min(FITTED_MIN_CELL, byWidth), needsScroll: true };
	}

	return { cell: fitted, needsScroll: false };
}

function useFittedCell(
	rows: number,
	cols: number,
	enabled: boolean,
): [React.RefObject<HTMLDivElement | null>, FittedSize] {
	const ref = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState<FittedSize>({ cell: 0, needsScroll: false });

	useEffect(() => {
		const element = ref.current;
		if (!enabled || !element) return;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const next = fitCell(entry.contentRect, rows, cols);
			setSize((current) =>
				current.cell === next.cell && current.needsScroll === next.needsScroll
					? current
					: next,
			);
		});

		observer.observe(element);
		return () => observer.disconnect();
	}, [cols, enabled, rows]);

	return [ref, size];
}

type DailyGridProps = {
	puzzle: DailyPuzzlePublic;
	revealedCells: Set<string>;
	cellLetters: Map<string, string>;
	highlightedWordId: number | null;
	animatingWordId?: number | null;
	animatingPreExistingLetters?: Set<string>;
	landedAnimatingCells?: Set<string>;
	bounceCells?: Set<string>;
	clueCells?: Set<string>;
	clueCellsFading?: boolean;
	locateCells?: Set<string>;
	// Cells of the word whose panel is open, marked for as long as it stays open.
	selectedCells?: Set<string>;
	// Size the board from its container instead of from the page width.
	fitted?: boolean;
};

export function DailyGrid({
	puzzle,
	revealedCells,
	cellLetters,
	highlightedWordId,
	animatingWordId = null,
	animatingPreExistingLetters = new Set(),
	landedAnimatingCells = new Set(),
	bounceCells = new Set(),
	clueCells,
	clueCellsFading = false,
	locateCells,
	selectedCells,
	fitted = false,
}: DailyGridProps) {
	const [fitRef, { cell: fittedCell, needsScroll }] = useFittedCell(
		puzzle.rows,
		puzzle.cols,
		fitted,
	);
	const animatingCellKeys = useMemo(() => {
		if (animatingWordId == null) {
			return new Set<string>();
		}

		const slot = puzzle.wordSlots.find(
			(wordSlot) => wordSlot.id === animatingWordId,
		);
		if (!slot) {
			return new Set<string>();
		}

		return new Set<string>(
			Array.from({ length: slot.length }, (_, index) =>
				getSlotCellKey(slot, index),
			),
		);
	}, [animatingWordId, puzzle.wordSlots]);
	const highlightedCellOrder = useMemo(() => {
		const slot = puzzle.wordSlots.find(
			(wordSlot) => wordSlot.id === highlightedWordId,
		);
		if (!slot) {
			return new Map<string, number>();
		}

		return new Map<string, number>(
			Array.from({ length: slot.length }, (_, index) => [
				getSlotCellKey(slot, index),
				index,
			]),
		);
	}, [highlightedWordId, puzzle.wordSlots]);
	const middleDotMarkers = useMemo(() => {
		const markers = new Map<string, { bottom: boolean; right: boolean }>();

		for (const slot of puzzle.wordSlots) {
			for (const index of slot.middleDotAfterIndices ?? []) {
				const cellKey = getSlotCellKey(slot, index);
				const existing = markers.get(cellKey) ?? {
					bottom: false,
					right: false,
				};

				if (slot.direction === "horizontal") {
					existing.right = true;
				} else {
					existing.bottom = true;
				}

				markers.set(cellKey, existing);
			}
		}

		return markers;
	}, [puzzle.wordSlots]);

	if (fitted) {
		return (
			<div ref={fitRef} className="relative min-h-0 min-w-0 flex-1">
				<div
					className={`absolute inset-0 flex justify-center ${
						needsScroll
							? "items-start overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							: "items-center"
					}`}
				>
					{fittedCell > 0 ? (
						<div
							className="grid"
							style={{
								gap: `${FITTED_GAP}px`,
								gridTemplateColumns: `repeat(${puzzle.cols}, ${fittedCell}px)`,
							}}
						>
							{renderCells(fittedCell)}
						</div>
					) : null}
				</div>
			</div>
		);
	}

	return (
		<div
			className="flex items-center justify-center w-full @container"
			style={{ "--cols": puzzle.cols } as CSSProperties}
		>
			<div
				className="grid gap-[3px] sm:gap-1 w-full max-w-2xl mx-auto"
				style={{
					gridTemplateColumns: `repeat(${puzzle.cols}, 1fr)`,
				}}
			>
				{renderCells(null)}
			</div>
		</div>
	);

	function renderCells(cellSize: number | null) {
		return puzzle.gridMask.map((row, rowIdx) =>
			row.map((cell, colIdx) => {
				const key = `${rowIdx},${colIdx}`;
				const isRevealed = revealedCells.has(key);
				const isAnimatingCell = animatingCellKeys.has(key);
				const showLetter =
					isRevealed &&
					cellLetters.has(key) &&
					(!isAnimatingCell ||
						animatingPreExistingLetters.has(key) ||
						landedAnimatingCells.has(key));
				const highlightedLetterIndex = highlightedCellOrder.get(key);
				const isJustLanded = bounceCells.has(key);
				const isJustGuessed = isJustLanded || highlightedLetterIndex != null;
				const isClueCell = clueCells?.has(key) ?? false;
				const isLocateCell = locateCells?.has(key) ?? false;
				const isSelectedCell = selectedCells?.has(key) ?? false;
				const middleDotMarker = middleDotMarkers.get(key);

				if (!cell) {
					return cellSize == null ? (
						<div key={key} className="aspect-square bg-transparent" />
					) : (
						<div
							key={key}
							style={{ width: cellSize, height: cellSize }}
							aria-hidden
						/>
					);
				}

				return (
					<div
						key={key}
						data-cell-key={key}
						style={{
							...(isJustGuessed
								? ({
										"--guess-letter-delay": isJustLanded
											? "0ms"
											: `${(highlightedLetterIndex ?? 0) * 34}ms`,
									} as CSSProperties)
								: null),
							...(cellSize == null
								? null
								: {
										width: cellSize,
										height: cellSize,
										borderRadius: Math.max(4, Math.round(cellSize * 0.24)),
										fontSize: Math.max(9, Math.round(cellSize * 0.54)),
									}),
						}}
						className={`relative border flex items-center justify-center font-bold leading-none transition-colors duration-300 ${
							cellSize == null
								? "aspect-square rounded-[0.4rem] sm:rounded-[0.6rem] text-[clamp(0.25rem,calc(50cqi/var(--cols)),1.5rem)]"
								: ""
						} ${
							isRevealed
								? isSelectedCell
									? "bg-primary/20 border-primary text-foreground"
									: "bg-primary/12 border-primary/40 text-foreground"
								: isSelectedCell
									? "bg-game-cell-active border-game-cell-active-border"
									: cellSize == null
										? "bg-muted border-border/50"
										: "bg-game-cell border-game-cell-border"
						} ${isClueCell ? "clue-gradient-cell" : ""} ${isClueCell && clueCellsFading ? "clue-gradient-cell-hidden" : ""} ${isLocateCell ? "grid-locate-cell" : ""} ${isJustGuessed ? "grid-word-just-guessed-cell" : ""}`}
					>
						{showLetter ? (
							<span
								className={isJustGuessed ? "grid-word-just-guessed-letter" : ""}
							>
								{cellLetters.get(key)?.toUpperCase()}
							</span>
						) : (
							""
						)}
						{middleDotMarker?.right ? (
							<span
								aria-hidden
								style={{
									transform: "translate(calc(50% + 1.5px), -50%)",
								}}
								className="pointer-events-none absolute top-1/2 right-0 z-10 text-[1.6em] font-black leading-none text-foreground"
							>
								·
							</span>
						) : null}
						{middleDotMarker?.bottom ? (
							<span
								aria-hidden
								style={{
									transform: "translate(-50%, calc(50% + 1.5px))",
								}}
								className="pointer-events-none absolute bottom-0 left-1/2 z-10 text-[1.6em] font-black leading-none text-foreground"
							>
								·
							</span>
						) : null}
					</div>
				);
			}),
		);
	}
}
