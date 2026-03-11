import type { CSSProperties } from "react";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";

type DailyGridProps = {
	puzzle: DailyPuzzlePublic;
	revealedCells: Set<string>;
	cellLetters: Map<string, string>;
};

export function DailyGrid({
	puzzle,
	revealedCells,
	cellLetters,
}: DailyGridProps) {
	return (
		<div
			className="flex items-center justify-center w-full @container"
			style={{ "--cols": puzzle.cols } as CSSProperties}
		>
			<div
				className="grid gap-0.5 sm:gap-1 w-full max-w-2xl mx-auto"
				style={{
					gridTemplateColumns: `repeat(${puzzle.cols}, 1fr)`,
				}}
			>
				{puzzle.gridMask.map((row, rowIdx) =>
					row.map((cell, colIdx) => {
						const key = `${rowIdx},${colIdx}`;
						const isRevealed = revealedCells.has(key);

						if (!cell) {
							return <div key={key} className="aspect-square bg-transparent" />;
						}

						return (
							<div
								key={key}
								className={`aspect-square border rounded-[0.4rem] sm:rounded-[0.6rem] sm:border-2 flex items-center justify-center font-bold leading-none overflow-hidden text-[clamp(0.25rem,calc(50cqi/var(--cols)),1.5rem)] transition-all duration-300 ${
									isRevealed
										? "bg-primary/18 border-primary/70 text-secondary-foreground"
										: "bg-muted/80 border-muted-foreground/30 dark:bg-muted/90 dark:border-muted-foreground/45"
								}`}
							>
								{isRevealed ? cellLetters.get(key)?.toUpperCase() : ""}
							</div>
						);
					}),
				)}
			</div>
		</div>
	);
}
