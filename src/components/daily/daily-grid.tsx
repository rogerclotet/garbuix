import { type CSSProperties, useMemo } from "react";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { getSlotCellKey } from "./daily-helpers";

type DailyGridProps = {
	puzzle: DailyPuzzlePublic;
	revealedCells: Set<string>;
	cellLetters: Map<string, string>;
	highlightedWordId: number | null;
};

export function DailyGrid({
	puzzle,
	revealedCells,
	cellLetters,
	highlightedWordId,
}: DailyGridProps) {
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
						const highlightedLetterIndex = highlightedCellOrder.get(key);
						const isJustGuessed = highlightedLetterIndex != null;
						const middleDotMarker = middleDotMarkers.get(key);

						if (!cell) {
							return <div key={key} className="aspect-square bg-transparent" />;
						}

						return (
							<div
								key={key}
								style={
									isJustGuessed
										? ({
												"--guess-letter-delay": `${highlightedLetterIndex * 34}ms`,
											} as CSSProperties)
										: undefined
								}
								className={`relative aspect-square border rounded-[0.4rem] sm:rounded-[0.6rem] flex items-center justify-center font-bold leading-none text-[clamp(0.25rem,calc(50cqi/var(--cols)),1.5rem)] transition-colors duration-300 ${
									isRevealed
										? "bg-primary/12 border-primary/40 text-foreground"
										: "bg-muted border-border/50"
								} ${isJustGuessed ? "grid-word-just-guessed-cell" : ""}`}
							>
								{isRevealed ? (
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
										className="pointer-events-none absolute top-1/2 right-[-0.2em] z-10 -translate-y-1/2 text-[0.9em] leading-none text-primary/70"
									>
										·
									</span>
								) : null}
								{middleDotMarker?.bottom ? (
									<span
										aria-hidden
										className="pointer-events-none absolute bottom-[-0.28em] left-1/2 z-10 -translate-x-1/2 text-[0.9em] leading-none text-primary/70"
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
