import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function WordRulesAnnouncementDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-md">
				<div className="flex items-center gap-3 rounded-lg bg-primary/10 p-4 text-primary">
					<Logo className="h-10 w-6 shrink-0" aria-hidden />
					<div>
						<p className="mb-1 text-xs font-bold uppercase tracking-widest">
							Novetat
						</p>
						<AlertDialogTitle className="text-2xl font-extrabold">
							Més paraules vàlides
						</AlertDialogTitle>
					</div>
				</div>
				<AlertDialogHeader>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-left">
							<p>Des del repte d'avui, el diccionari accepta també:</p>
							<ul className="list-disc space-y-1 pl-5">
								<li>
									<strong className="font-semibold text-foreground">
										Femenins en singular
									</strong>
									: noia, petita, catalana.
								</li>
								<li>
									<strong className="font-semibold text-foreground">
										Determinants, pronoms, preposicions i conjuncions
									</strong>
									: cada, ningú, nosaltres, sense.
								</li>
								<li>
									<strong className="font-semibold text-foreground">
										Paraules habituals que faltaven
									</strong>
									: ordre, pols, coma.
								</li>
							</ul>
							<p>
								Els mots encreuats ara poden amagar femenins i les paraules que
								faltaven. Els determinants, pronoms, preposicions i conjuncions
								només compten com a paraules extra.
							</p>
							<p>
								Continuen sense valer els plurals (cases), els verbs conjugats
								(menjo), els noms propis i les interjeccions (hola).
							</p>
							<p>
								Ho tens tot explicat a{" "}
								<Link
									to="/sobre-el-joc"
									className="text-link"
									onClick={() => onOpenChange(false)}
								>
									Sobre el joc
								</Link>
								.
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogAction>Entesos</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
