import { Link } from "@tanstack/react-router";
import { ArrowRight, LogIn } from "lucide-react";
import { TriesHistogram } from "@/components/leaderboard/tries-histogram";
import { Logo, QuadratLogo } from "@/components/logo";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatMadridTime } from "@/lib/puzzle-dates";
import { useLeaderboard } from "@/lib/use-leaderboard";

type WinDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	guessCount: number;
	hintsUsed: number;
	completedAt: string | null;
	currentStreak: number;
	isAnonymous: boolean;
	onSignIn: () => void;
};

function Stat({ value, label }: { value: string; label: string }) {
	return (
		<div className="bg-muted/50 flex flex-col items-center justify-center rounded-lg border border-border/50 px-2 py-2">
			<div className="text-foreground text-xl font-semibold tabular-nums">
				{value}
			</div>
			<div className="text-muted-foreground mt-0.5 text-xs uppercase tracking-wide font-ui">
				{label}
			</div>
		</div>
	);
}

export function WinDialog({
	open,
	onOpenChange,
	guessCount,
	hintsUsed,
	completedAt,
	currentStreak,
	isAnonymous,
	onSignIn,
}: WinDialogProps) {
	// Read here rather than in Daily: the leaderboard stream ticks on every
	// player's progress, and the board above shouldn't re-render for it.
	const { entries, localParticipantId } = useLeaderboard();
	const formattedTime = completedAt ? formatMadridTime(completedAt) : null;
	const showStreak = currentStreak >= 3;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] gap-3 overflow-y-auto data-[size=default]:max-w-sm data-[size=default]:sm:max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle className="text-lg">
						Felicitats! 🎉
					</AlertDialogTitle>
					<AlertDialogDescription>
						Has completat el joc d'avui. Aquí tens el teu resum.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div
					className={`grid gap-2 ${showStreak || formattedTime ? "grid-cols-2" : "grid-cols-2"}`}
				>
					<Stat
						value={String(guessCount)}
						label={guessCount === 1 ? "Intent" : "Intents"}
					/>
					<Stat
						value={String(hintsUsed)}
						label={hintsUsed === 1 ? "Pista" : "Pistes"}
					/>
					{formattedTime ? (
						<Stat value={formattedTime} label="Acabat a les" />
					) : null}
					{showStreak ? (
						<Stat value={`${currentStreak} 🔥`} label="Ratxa (dies)" />
					) : null}
				</div>

				<TriesHistogram
					entries={entries}
					highlightTries={guessCount}
					selfParticipantId={localParticipantId}
				/>

				<nav aria-label="Altres jocs" className="grid grid-cols-2 gap-2">
					<h3 className="col-span-2 text-sm font-semibold">
						Et ve de gust un altre repte?
					</h3>
					<AlertDialogAction
						asChild
						className="col-span-2 min-h-14 justify-start gap-3 px-3 text-left [--primary-foreground:#ffffff] [--primary:var(--game-quadrat)] dark:[--primary-foreground:#0d2a52]"
					>
						<Link to="/quadrat">
							<QuadratLogo className="size-6" aria-hidden />
							<span className="min-w-0 flex-1 whitespace-normal">
								<span className="block font-semibold">Garbuix quadrat</span>
								<span className="block text-xs font-ui">
									Troba 15 paraules en una graella de 4×4.
								</span>
							</span>
							<ArrowRight className="size-4" aria-hidden />
						</Link>
					</AlertDialogAction>
					<AlertDialogAction asChild variant="outline" className="min-h-10">
						<Link to="/mini">
							<Logo className="size-4 text-(--game-mini)" aria-hidden />
							Mini
						</Link>
					</AlertDialogAction>
					<AlertDialogAction asChild variant="outline" className="min-h-10">
						<Link to="/sillabes">
							<Logo className="size-4 text-(--game-syllables)" aria-hidden />
							Síl·labes
						</Link>
					</AlertDialogAction>
				</nav>

				{isAnonymous ? (
					<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
						<p className="text-sm font-medium leading-tight">
							Guarda la teva ratxa
						</p>
						<p className="text-muted-foreground mt-1 text-xs leading-snug font-ui">
							Entra amb un compte per jugar des de qualsevol dispositiu.
						</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-2.5 w-full gap-2 bg-background"
							onClick={() => {
								onSignIn();
							}}
						>
							<LogIn className="size-4" />
							Entrar
						</Button>
					</div>
				) : null}

				<AlertDialogFooter className="py-2">
					<AlertDialogCancel>Tancar</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
