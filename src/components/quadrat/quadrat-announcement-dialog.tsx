import { Link } from "@tanstack/react-router";
import { QuadratLogo } from "@/components/logo";
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

export function QuadratAnnouncementDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-md">
				<div className="flex items-center gap-3 rounded-lg bg-blue-100 p-4 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
					<QuadratLogo className="size-10 shrink-0" aria-hidden />
					<div>
						<p className="mb-1 text-xs font-bold uppercase tracking-widest">
							Novetat
						</p>
						<AlertDialogTitle className="text-3xl font-extrabold">
							Garbuix{" "}
							<span className="text-amber-700 dark:text-amber-300">
								quadrat
							</span>
						</AlertDialogTitle>
					</div>
				</div>
				<AlertDialogHeader>
					<p className="text-lg font-bold">Quinze paraules en setze lletres</p>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-left">
							<p>
								Un joc nou cada dia: un quadrat de 4×4 lletres amaga 15
								paraules. Arrossega el dit d'una lletra a una altra del costat,
								en qualsevol direcció, per trobar-les totes.
							</p>
							<p>
								El trobaràs al menú, a{" "}
								<strong className="font-semibold text-foreground">
									Garbuix quadrat
								</strong>
								. La primera vegada t'ensenya a jugar amb un tutorial curt.
							</p>
							<p>
								El progrés i l'historial de Quadrat es guarden per separat dels
								de Garbuix.
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Continuar amb Garbuix</AlertDialogCancel>
					{/* Slot appends this to Button's bg-primary instead of merging the
					    two, so a bg-* class here loses to it. Repoint the token. */}
					<AlertDialogAction
						asChild
						className="[--primary-foreground:#ffffff] [--primary:var(--game-quadrat)] dark:[--primary-foreground:#0d2a52]"
					>
						<Link to="/quadrat">Provar Garbuix quadrat</Link>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
