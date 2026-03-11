import { CornerDownLeft, Delete, Lightbulb, Shuffle } from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { Button } from "@/components/ui/button";

type DailyControlsProps = {
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
		<div className="fixed bottom-0 left-0 right-0 z-40 lg:static">
			<div className="rounded-t-2xl rounded-b-none border-t bg-card shadow-[0_-8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 dark:shadow-[0_-8px_30px_rgb(0,0,0,0.5)] lg:rounded-xl lg:border lg:shadow-none lg:backdrop-blur-none">
				<div className="hidden lg:block px-6 pt-6">
					<h2 className="font-semibold leading-none tracking-tight">
						Endevina una paraula
					</h2>
				</div>
				<div className="p-6">
					<div className="flex flex-col items-center gap-4 lg:gap-6">
						<div className="text-2xl sm:text-3xl font-bold tracking-widest h-10 sm:h-12 border-b-2 border-primary w-full text-center uppercase flex items-center justify-center dark:text-white">
							{currentGuess}
						</div>

						<div className="flex items-center justify-evenly w-full gap-4 sm:gap-6">
							<div className="grid grid-cols-3 gap-2 sm:gap-3">
								{shuffledLetters.map((letter) => (
									<Button
										key={`letter-${letter}`}
										variant="outline"
										size="lg"
										className="w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 md:w-16 md:h-16 text-xl font-bold rounded-full border-2 transition-all duration-100 active:scale-95 active:bg-primary/10 active:shadow-inner touch-manipulation"
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
								className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl transition-transform duration-100 active:scale-95 touch-manipulation"
								disabled={currentGuess.length < 4}
								aria-label="Comprovar"
							>
								<CornerDownLeft className="h-5 w-5" />
							</Button>
						</div>

						<div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onBackspace)}
								onClick={(event) => runClickAction(event, onBackspace)}
								className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98] touch-manipulation"
								disabled={currentGuess.length === 0}
							>
								<Delete className="w-4 h-4" />
								Esborrar
							</Button>
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onHint)}
								onClick={(event) => runClickAction(event, onHint)}
								className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98] touch-manipulation"
								disabled={hintsUsed >= 3 || isComplete}
								size="lg"
							>
								<Lightbulb
									className={`w-4 h-4 ${hintsUsed < 3 ? "text-amber-500" : "text-gray-400"}`}
								/>
								Pista ({3 - hintsUsed})
							</Button>
							<Button
								variant="ghost"
								onPointerDown={(event) => runPressAction(event, onShuffle)}
								onClick={(event) => runClickAction(event, onShuffle)}
								className="gap-2 h-9 sm:h-10 transition-transform duration-100 active:scale-[0.98] touch-manipulation"
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
