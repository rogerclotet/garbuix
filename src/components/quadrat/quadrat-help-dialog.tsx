import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { openQuadratTutorial } from "./quadrat-tutorial-store";

export function QuadratHelpDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Com es juga a Garbuix quadrat?</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-left">
							<p>
								Cada dia hi ha 15 paraules amagades en un quadrat de 16 lletres.
							</p>
							<p>
								Arrossega el dit d'una lletra a una altra del costat, en
								horitzontal, vertical o diagonal, i deixa anar per comprovar la
								paraula. Han de tenir 4 lletres o més, i cada lletra només hi
								surt una vegada.
							</p>
							<p>
								El número de cada lletra diu quantes paraules hi passen encara,
								i les línies uneixen les lletres que van juntes en alguna
								paraula. Quan en trobes una, els números baixen. Les lletres que
								arriben a zero s'apaguen.
							</p>
							<p>
								Tens tres pistes al dia. Mantén premut Pista per llegir com és
								una de les paraules i veure al tauler on comença.
							</p>
							<p>
								Les paraules que existeixen però no són del joc surten com a
								vàlides, però no compten ni fan baixar els números.
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button
						variant="outline"
						onClick={() => {
							onOpenChange(false);
							openQuadratTutorial();
						}}
					>
						Fes el tutorial
					</Button>
					<Button onClick={() => onOpenChange(false)}>Som-hi!</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
