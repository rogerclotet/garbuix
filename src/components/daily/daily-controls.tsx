import { CornerDownLeft, Delete, Lightbulb, Shuffle } from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { Button } from "@/components/ui/button";

type DailyControlsProps = {
	canUseHint: boolean;
	currentGuess: string;
	hintsUsed: number;
	isComplete: boolean;
	shuffledLetters: string[];
	onBackspace: () => void;
	onHint: () => void;
	onLetterClick: (letter: string) => void;
	onShuffle: () => void;
	onSubmitGuess: () => void;
	runClickAction: (
		event: MouseEvent<HTMLButtonElement>,
		action: () => void,
	) => void;
	runPressAction: (
		event: PointerEvent<HTMLButtonElement>,
		action: () => void,
	) => void;
};

export function DailyControls({
	canUseHint,
	currentGuess,
	hintsUsed,
	isComplete,
	shuffledLetters,
	onBackspace,
	onHint,
	onLetterClick,
	onShuffle,
	onSubmitGuess,
	runClickAction,
	runPressAction,
}: DailyControlsProps) {
	if (isComplete) {
		return null;
	}

	return (
		<div className="fixed right-0 bottom-0 left-0 z-40 touch-none overscroll-none lg:static lg:touch-auto lg:overscroll-auto">
			<div className="rounded-t-2xl rounded-b-none border-t border-border/60 bg-background shadow-[0_-2px_12px_rgb(0,0,0,0.06)] dark:shadow-[0_-2px_12px_rgb(0,0,0,0.25)] pb-[env(safe-area-inset-bottom)] select-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:dark:shadow-none lg:pb-0 lg:select-auto">
				<div className="hidden lg:block">
					<h2 className="font-semibold leading-none tracking-tight">
						Endevina una paraula
					</h2>
					<p className="mt-2 text-sm text-muted-foreground font-ui">
						Escriu amb el teclat, esborra amb retrocés i envia amb Enter o
						espai.
					</p>
				</div>
				<div className="p-6 lg:px-0 lg:pt-4">
					<div className="flex flex-col items-center gap-4 lg:gap-6">
						<div className="text-2xl sm:text-3xl font-bold tracking-widest h-10 sm:h-12 border-b-2 border-primary/60 w-full text-center uppercase flex items-center justify-center">
							{currentGuess}
						</div>

						<div className="flex items-center justify-evenly w-full gap-4 sm:gap-6">
							<div className="grid grid-cols-3 gap-2 sm:gap-3">
								{shuffledLetters.map((letter) => (
									<Button
										key={`letter-${letter}`}
										variant="outline"
										size="lg"
										className="w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 md:w-16 md:h-16 text-xl font-bold rounded-lg sm:rounded-xl border border-border bg-background hover:bg-muted active:bg-primary/10 active:scale-95 transition-all duration-100 touch-manipulation"
										onPointerDown={(event) =>
											runPressAction(event, () => onLetterClick(letter))
										}
										onClick={(event) =>
											runClickAction(event, () => onLetterClick(letter))
										}
									>
										{letter.toUpperCase()}
									</Button>
								))}
							</div>

							<Button
								onPointerDown={(event) => runPressAction(event, onSubmitGuess)}
								onClick={(event) => runClickAction(event, onSubmitGuess)}
								size="icon"
								className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl touch-manipulation"
								disabled={currentGuess.length < 4}
								aria-label="Comprovar"
							>
								<CornerDownLeft className="h-5 w-5" />
							</Button>
						</div>

						<div className="grid grid-cols-3 gap-2 sm:gap-4 w-full font-ui">
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onBackspace)}
								onClick={(event) => runClickAction(event, onBackspace)}
								className="gap-2 h-9 sm:h-10 touch-manipulation"
								disabled={currentGuess.length === 0}
							>
								<Delete className="w-4 h-4" />
								Esborrar
							</Button>
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onHint)}
								onClick={(event) => runClickAction(event, onHint)}
								className="gap-2 h-9 sm:h-10 touch-manipulation"
								disabled={!canUseHint || isComplete}
								size="lg"
							>
								<Lightbulb
									className={`w-4 h-4 ${canUseHint ? "text-amber-500" : "text-muted-foreground/40"}`}
								/>
								Pista ({3 - hintsUsed})
							</Button>
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onShuffle)}
								onClick={(event) => runClickAction(event, onShuffle)}
								className="gap-2 h-9 sm:h-10 touch-manipulation"
							>
								<Shuffle className="w-4 h-4" />
								Barrejar
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
