import { LogIn } from "lucide-react";
import { TriesHistogram } from "@/components/leaderboard/tries-histogram";
import {
	AlertDialog,
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
		<div className="bg-muted/50 flex flex-col items-center justify-center rounded-lg border border-border/50 px-2 py-3">
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
	const { entries } = useLeaderboard();
	const formattedTime = completedAt ? formatMadridTime(completedAt) : null;
	const showStreak = currentStreak >= 3;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-md">
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

				<TriesHistogram entries={entries} highlightTries={guessCount} />

				{isAnonymous ? (
					<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
						<p className="text-sm font-medium leading-tight">
							Guarda la teva ratxa
						</p>
						<p className="text-muted-foreground mt-1 text-xs leading-snug font-ui">
							Connecta amb Google per jugar des de qualsevol dispositiu i
							aparèixer a la classificació amb el teu nom.
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
							Connectar amb Google
						</Button>
					</div>
				) : null}

				<AlertDialogFooter>
					<AlertDialogCancel>Tancar</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
