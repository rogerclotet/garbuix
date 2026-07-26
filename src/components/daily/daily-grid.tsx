import { type CSSProperties, useMemo } from "react";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getSlotCellKey } from "./daily-helpers";

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
}: DailyGridProps) {
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
				{puzzle.gridMask.map((row, rowIdx) =>
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
						const isJustGuessed =
							isJustLanded || highlightedLetterIndex != null;
						const isClueCell = clueCells?.has(key) ?? false;
						const isLocateCell = locateCells?.has(key) ?? false;
						const middleDotMarker = middleDotMarkers.get(key);

						if (!cell) {
							return <div key={key} className="aspect-square bg-transparent" />;
						}

						return (
							<div
								key={key}
								data-cell-key={key}
								style={
									isJustGuessed
										? ({
												"--guess-letter-delay": isJustLanded
													? "0ms"
													: `${(highlightedLetterIndex ?? 0) * 34}ms`,
											} as CSSProperties)
										: undefined
								}
								className={`relative aspect-square border rounded-[0.4rem] sm:rounded-[0.6rem] flex items-center justify-center font-bold leading-none text-[clamp(0.25rem,calc(50cqi/var(--cols)),1.5rem)] transition-colors duration-300 ${
									isRevealed
										? "bg-primary/12 border-primary/40 text-foreground"
										: "bg-muted border-border/50"
								} ${isClueCell ? "clue-gradient-cell" : ""} ${isClueCell && clueCellsFading ? "clue-gradient-cell-hidden" : ""} ${isLocateCell ? "grid-locate-cell" : ""} ${isJustGuessed ? "grid-word-just-guessed-cell" : ""}`}
							>
								{showLetter ? (
									<span
										className={
											isJustGuessed ? "grid-word-just-guessed-letter" : ""
										}
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
				)}
			</div>
		</div>
	);
}
