import { getRemainingBoard } from "@/lib/quadrat-board";
import { QUADRAT_CELL_COUNT } from "@/lib/quadrat-types";
import { QuadratBoard } from "./quadrat-board";

const SOLVED_BOARD = getRemainingBoard(
	{ cellUses: new Array<number>(QUADRAT_CELL_COUNT).fill(0), connections: [] },
	[],
);

// A finished day's letters with its fifteen words.
export function QuadratSolution({
	letters,
	words,
}: {
	letters: string[];
	words: string[];
}) {
	return (
		<div className="space-y-4">
			<div className="mx-auto w-full max-w-60">
				<QuadratBoard
					letters={letters}
					connections={[]}
					board={SOLVED_BOARD}
					path={[]}
					interactive={false}
					complete
					clueStarts={[]}
					flashPath={null}
					onPathChange={() => {}}
					onRelease={() => {}}
				/>
			</div>
			<ul className="flex flex-wrap justify-center gap-x-2 text-[13px] font-extrabold leading-[18px] text-primary">
				{words.map((word) => (
					<li key={word}>{word.toUpperCase()}</li>
				))}
			</ul>
		</div>
	);
}
