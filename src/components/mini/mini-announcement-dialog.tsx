import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
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

export function MiniAnnouncementDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-md">
				<div className="flex items-center gap-3 rounded-lg bg-violet-100 p-4 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
					<Logo className="h-12 w-8 shrink-0" aria-hidden />
					<div>
						<p className="mb-1 text-xs font-bold uppercase tracking-widest">
							Novetat
						</p>
						<AlertDialogTitle className="text-3xl font-extrabold">
							Garbuix{" "}
							<span className="text-amber-700 dark:text-amber-300">mini</span>
						</AlertDialogTitle>
					</div>
				</div>
				<AlertDialogHeader>
					<p className="text-lg font-bold">Pels més petits de la casa</p>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-left">
							<p>
								Un Garbuix per a nens i nenes que comencen a lletrejar: cinc
								paraules curtes i conegudes cada dia, amb pistes de lletres
								il·limitades.
							</p>
							<p>
								El trobaràs al menú, a{" "}
								<strong className="font-semibold text-foreground">
									Garbuix mini
								</strong>
								, just sota{" "}
								<strong className="font-semibold text-foreground">
									Com s'hi juga?
								</strong>
							</p>
							<p>
								El progrés i les estadístiques de Mini es guarden per separat
								dels de Garbuix.
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Continuar amb Garbuix</AlertDialogCancel>
					<AlertDialogAction
						asChild
						className="bg-violet-700 text-white hover:bg-violet-800 dark:bg-violet-300 dark:text-violet-950 dark:hover:bg-violet-200"
					>
						<Link to="/mini">Provar Garbuix mini</Link>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
