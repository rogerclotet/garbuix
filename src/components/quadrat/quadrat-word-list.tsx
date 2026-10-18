import { Check, Circle, Info, Sparkles } from "lucide-react";
import { getOptimotDefinitionUrl } from "@/lib/puzzle-helpers";
import type { QuadratWordSlot } from "@/lib/quadrat-types";

function ClueLine({ text }: { text: string }) {
	return (
		<span className="block min-w-0 pl-7 text-sm leading-relaxed text-muted-foreground wrap-anywhere font-ui">
			{text}
		</span>
	);
}

// The same rows as the classic list, without the grid to point at.
export function QuadratWordList({
	wordSlots,
	guessedWordIds,
	answers,
	clueWordIds,
	clueTexts,
}: {
	wordSlots: QuadratWordSlot[];
	guessedWordIds: number[];
	answers: Record<number, string>;
	clueWordIds: number[];
	clueTexts: Record<number, string>;
}) {
	const foundOrder = new Map(guessedWordIds.map((id, index) => [id, index]));
	const clued = new Set(clueWordIds);
	// Latest find first, as in the classic list.
	const foundSlots = wordSlots
		.filter((slot) => foundOrder.has(slot.id) && answers[slot.id])
		.sort(
			(left, right) =>
				(foundOrder.get(right.id) ?? 0) - (foundOrder.get(left.id) ?? 0),
		);
	const missingSlots = wordSlots
		.filter((slot) => !foundOrder.has(slot.id))
		.sort(
			(left, right) =>
				Number(clued.has(right.id)) - Number(clued.has(left.id)) ||
				left.length - right.length ||
				left.id - right.id,
		);

	return (
		<div className="flex min-w-0 flex-col">
			<h3 className="mb-3 flex shrink-0 items-baseline justify-between text-2xl font-extrabold tracking-tight lg:text-xl">
				Paraules
				<span className="text-base font-bold tabular-nums text-muted-foreground font-ui">
					{guessedWordIds.length}/{wordSlots.length}
				</span>
			</h3>
			<div className="min-w-0 px-1 pb-1">
				{missingSlots.length > 0 ? (
					<h4 className="mb-1 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground font-ui">
						Per descobrir{" "}
						<span className="tabular-nums">{missingSlots.length}</span>
					</h4>
				) : null}
				{missingSlots.map((slot) => {
					const isClued = clued.has(slot.id);
					const clueText = clueTexts[slot.id];
					return (
						<div
							key={slot.id}
							className={`relative flex min-w-0 flex-col border-b border-border/60 py-2 pl-2 ${isClued ? "word-clue-marker" : ""}`}
						>
							<div className="flex min-h-9 items-center gap-2">
								<span
									className={`flex size-5 shrink-0 items-center justify-center ${isClued ? "text-primary" : "text-muted-foreground"}`}
									aria-hidden="true"
								>
									{isClued ? (
										<Sparkles className="size-4" />
									) : (
										<Circle className="size-2" />
									)}
								</span>
								<span
									className="min-w-0 font-bold tracking-[0.3em] text-muted-foreground"
									aria-hidden="true"
								>
									{"_".repeat(slot.length)}
								</span>
								<span className="sr-only">Paraula per descobrir</span>
								<span className="ml-auto shrink-0 text-[0.625rem] text-muted-foreground font-ui">
									{slot.length} lletres
								</span>
							</div>
							{/* The board already marks the first letter, so a clue whose
							    text never arrives still helps. */}
							{isClued ? (
								<ClueLine
									text={clueText ?? "Comença per la lletra marcada al tauler."}
								/>
							) : null}
						</div>
					);
				})}
				{foundSlots.length > 0 ? (
					<h4
						className={`${missingSlots.length > 0 ? "mt-6" : ""} mb-1 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground font-ui`}
					>
						Trobades <span className="tabular-nums">{foundSlots.length}</span>
					</h4>
				) : null}
				{foundSlots.map((slot) => {
					const word = answers[slot.id]?.toUpperCase() ?? "";
					const description = clueTexts[slot.id];
					return (
						<div
							key={slot.id}
							className="flex min-w-0 flex-col border-b border-border/60 py-2 pl-2"
						>
							<div className="flex min-h-9 items-center gap-2">
								<Check
									className="size-5 shrink-0 text-primary"
									aria-hidden="true"
								/>
								<span className="min-w-0 font-semibold text-foreground tracking-wider wrap-anywhere">
									{word}
								</span>
								<a
									href={getOptimotDefinitionUrl(answers[slot.id] ?? "")}
									target="_blank"
									rel="noopener noreferrer"
									className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:size-9"
									aria-label={`Consulta la definició de ${word} a l'Optimot`}
									title="Consulta la definició a l'Optimot"
								>
									<Info className="size-4" />
								</a>
								<span className="shrink-0 text-[0.625rem] text-muted-foreground font-ui">
									{slot.length} lletres
								</span>
							</div>
							{description ? <ClueLine text={description} /> : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}
