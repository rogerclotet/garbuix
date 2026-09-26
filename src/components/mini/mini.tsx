import { Link } from "@tanstack/react-router";
import { Check, PartyPopper, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DailyConfetti } from "@/components/daily/daily-confetti";
import { DailyControls } from "@/components/daily/daily-controls";
import { DailyGrid } from "@/components/daily/daily-grid";
import {
	buildCellLetters,
	buildRevealedCells,
	getDisplayedSlotWord,
	getGuessKeyboardAction,
	getRandomHintCellKey,
	getWordCellKeys,
} from "@/components/daily/daily-helpers";
import { DailyLoadingPage } from "@/components/daily/daily-loading";
import { useDailyRollover } from "@/components/daily/use-daily-rollover";
import { useDecodedProgress } from "@/components/daily/use-decoded-progress";
import { useMiniProgress } from "@/components/mini/use-mini-progress";
import { Button } from "@/components/ui/button";
import { getMiniPageData } from "@/lib/mini-server-fns";
import { createPuzzleEvent, resolveGuess } from "@/lib/puzzle-client";
import { shuffleArray } from "@/lib/shuffle";

export type MiniPageData = Awaited<ReturnType<typeof getMiniPageData>>;

export function Mini({ initialData }: { initialData: MiniPageData }) {
	const [data, setData] = useState(initialData);
	const refresh = useCallback(async () => {
		setData(await getMiniPageData());
	}, []);
	const expired = useDailyRollover(data.rolloverAt, refresh);
	return (
		<MiniGame
			key={`${data.puzzle.id}:${data.userId}`}
			data={data}
			expired={expired}
		/>
	);
}

function MiniGame({ data, expired }: { data: MiniPageData; expired: boolean }) {
	const { puzzle, userId } = data;
	const { progress, ready, dispatch, syncFailed } = useMiniProgress({
		puzzle,
		initialProgress: data.progress,
		userId,
	});
	const decoded = useDecodedProgress({
		puzzle,
		progress,
		userId,
		enabled: ready,
	});
	const [guess, setGuess] = useState("");
	const [message, setMessage] = useState(
		"Toca les lletres per formar una paraula.",
	);
	const [highlightedWordId, setHighlightedWordId] = useState<number | null>(
		null,
	);
	const [locateId, setLocateId] = useState<number | null>(null);
	const [celebrate, setCelebrate] = useState(false);
	const [busy, setBusy] = useState(false);
	const submitting = useRef(false);
	const snapshot = decoded.snapshot;
	const isPresentable = snapshot !== null;
	const visibleProgress = snapshot?.progress ?? progress;
	const complete = visibleProgress.completedAt !== null;
	const cellLetters = buildCellLetters(
		puzzle.wordSlots,
		snapshot?.answers ?? {},
		snapshot?.hints ?? {},
	);
	const revealedCells = buildRevealedCells(puzzle, progress);
	const canUseHint =
		ready &&
		!complete &&
		puzzle.hintCapsules.some(({ cellKey }) => !revealedCells.has(cellKey));
	const locateSlot = puzzle.wordSlots.find((slot) => slot.id === locateId);

	const appendLetter = useCallback((letter: string) => {
		setGuess((current) =>
			current.length < 5 ? current + letter.toUpperCase() : current,
		);
	}, []);
	const submit = useCallback(async () => {
		if (
			!isPresentable ||
			expired ||
			progress.completedAt ||
			guess.length < 3 ||
			submitting.current
		)
			return;
		submitting.current = true;
		setBusy(true);
		try {
			const result = await resolveGuess({ puzzle, progress, guess });
			dispatch(
				createPuzzleEvent("guess_added", {
					guessHash: result.guessHash,
					matchedWordId: result.matchedSlotId,
					unlockToken: result.unlockToken,
				}),
			);
			setGuess("");
			if (result.kind === "new_word") {
				setMessage(`Molt bé! Has trobat ${result.displayWord?.toUpperCase()}.`);
				setHighlightedWordId(result.matchedSlotId);
				if (progress.guessedWordIds.length + 1 === puzzle.wordSlots.length)
					setCelebrate(true);
			} else if (result.kind === "already_found")
				setMessage("Aquesta ja l'has trobada. Prova'n una altra!");
			else setMessage("Prova una altra paraula. Pots demanar una pista!");
		} catch {
			toast.error("No s'ha pogut comprovar la paraula. Torna-ho a provar.");
		} finally {
			submitting.current = false;
			setBusy(false);
		}
	}, [dispatch, expired, guess, isPresentable, progress, puzzle]);

	useEffect(() => {
		if (!isPresentable || expired || complete) return;
		const handleKey = (event: KeyboardEvent) => {
			const target = event.target;
			if (
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				document.querySelector(
					'[role="dialog"], [role="alertdialog"], [role="menu"]',
				)
			)
				return;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
			)
				return;
			if (
				target instanceof HTMLElement &&
				target.closest("button, a") &&
				(event.key === "Enter" || event.key === " ")
			)
				return;
			const action = getGuessKeyboardAction(
				event.key,
				puzzle.letters,
				event.code,
			);
			if (!action) return;
			event.preventDefault();
			if (submitting.current) return;
			if (action.type === "append_letter") appendLetter(action.letter);
			else if (action.type === "backspace")
				setGuess((current) => current.slice(0, -1));
			else void submit();
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [appendLetter, complete, expired, isPresentable, puzzle.letters, submit]);

	useEffect(() => {
		if (highlightedWordId === null && locateId === null) return;
		const timer = window.setTimeout(() => {
			setHighlightedWordId(null);
			setLocateId(null);
		}, 1400);
		return () => clearTimeout(timer);
	}, [highlightedWordId, locateId]);

	const hint = () => {
		const cellKey = getRandomHintCellKey(puzzle, revealedCells);
		if (!cellKey) return;
		dispatch(createPuzzleEvent("hint_used", { cellKey }));
		setMessage("Una lletra més! Mira on ha aparegut.");
	};

	if (!isPresentable) {
		return (
			<DailyLoadingPage
				synchronizing={Boolean(userId)}
				onRetry={decoded.hasError ? decoded.retry : undefined}
			/>
		);
	}

	return (
		<div className="mini-game mx-auto flex min-h-full max-w-4xl flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6 sm:pt-6">
			<DailyConfetti fire={celebrate} />
			<div
				className="mb-4 flex justify-center gap-1"
				role="img"
				aria-label={`${visibleProgress.guessedWordIds.length} de 5 paraules trobades`}
			>
				{puzzle.wordSlots.map((slot, index) => (
					<Star
						key={slot.id}
						aria-hidden
						className={`size-5 sm:size-6 ${index < visibleProgress.guessedWordIds.length ? "fill-[var(--mini-gold)] text-[var(--mini-gold)]" : "text-border"}`}
					/>
				))}
			</div>
			{expired ? (
				<p role="status">Estem preparant el nou Garbuixmini...</p>
			) : null}
			{syncFailed ? (
				<p role="status" className="mb-2 text-sm text-muted-foreground">
					Progrés desat al navegador. Es sincronitzarà quan torni la connexió.
				</p>
			) : null}
			{decoded.hasError ? (
				<Button variant="outline" onClick={decoded.retry}>
					Torna a carregar les lletres
				</Button>
			) : null}
			<div className="grid flex-1 items-center gap-4 sm:gap-8 md:grid-cols-[1.1fr_1fr]">
				<div className="mx-auto w-full max-w-sm md:max-w-md">
					<DailyGrid
						puzzle={puzzle}
						revealedCells={new Set(cellLetters.keys())}
						cellLetters={cellLetters}
						highlightedWordId={highlightedWordId}
						locateCells={locateSlot ? getWordCellKeys(locateSlot) : undefined}
					/>
				</div>
				<div className="space-y-3">
					{complete ? (
						<div className="rounded-3xl bg-primary/10 p-6 text-center">
							<PartyPopper
								aria-hidden
								className="mx-auto mb-3 size-10 text-[var(--mini-gold)]"
							/>
							<h2 className="text-2xl font-extrabold text-primary">
								Les has trobades totes!
							</h2>
							<p className="mt-2">Demà t'esperen cinc paraules noves.</p>
							<Button asChild className="mt-5">
								<Link to="/mini/dies-anteriors">Veure el meu progrés</Link>
							</Button>
						</div>
					) : (
						<>
							<p
								className="min-h-10 text-center text-sm text-muted-foreground"
								role="status"
							>
								{message}
							</p>
							<fieldset
								disabled={!ready || busy || expired}
								aria-label="Forma una paraula"
							>
								<DailyControls
									mini
									inline
									aiClueMode={false}
									layout="grid"
									canUseHint={canUseHint}
									currentGuess={guess}
									hintsUsed={progress.hintsUsed}
									isComplete={complete}
									shuffledLetters={progress.shuffledLetters}
									onBackspace={() =>
										setGuess((current) => current.slice(0, -1))
									}
									onHint={hint}
									onLetterClick={appendLetter}
									onShuffle={() =>
										dispatch(
											createPuzzleEvent("letters_shuffled", {
												shuffledLetters: shuffleArray(progress.shuffledLetters),
											}),
										)
									}
									onSubmitGuess={() => void submit()}
									submitFeedback={null}
									runClickAction={(event, action) => {
										action();
										if (event.detail > 0) event.currentTarget.blur();
									}}
									runPressAction={() => {}}
								/>
							</fieldset>
							<p className="text-center text-xs text-muted-foreground">
								Pots repetir les lletres i demanar tantes pistes com vulguis.
							</p>
						</>
					)}
				</div>
			</div>
			<section
				className="mt-5 border-t border-border/60 pt-4"
				aria-label="Les cinc paraules"
			>
				<div className="flex flex-wrap justify-center gap-2">
					{puzzle.wordSlots.map((slot) => {
						const found = visibleProgress.guessedWordIds.includes(slot.id);
						return (
							<button
								type="button"
								key={slot.id}
								onClick={() => setLocateId(slot.id)}
								className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 font-bold tracking-widest focus-visible:outline-2 focus-visible:outline-ring ${found ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
								aria-label={`${getDisplayedSlotWord(slot, cellLetters)}, ${found ? "trobada" : `${slot.length} lletres`}. Mostra al tauler.`}
							>
								{getDisplayedSlotWord(slot, cellLetters)}
								{found ? <Check className="size-4" aria-hidden /> : null}
							</button>
						);
					})}
				</div>
				{!complete && !canUseHint && ready ? (
					<p className="mt-3 text-center text-sm text-muted-foreground">
						Ja pots veure totes les lletres. Escriu les paraules per completar
						el joc!
					</p>
				) : null}
			</section>
		</div>
	);
}
