import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function SyllableHelpDialog({
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
					<AlertDialogTitle>Com es juga a Garbuix síl·labes?</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-left">
							<p>
								Cada dia hi ha cinc paraules per trobar. Cada casella del tauler
								és una síl·laba.
							</p>
							<p>
								Toca les síl·labes per formar una paraula i prem la fletxa per
								comprovar-la. Pots repetir una síl·laba: CO + CO fa COCO.
							</p>
							<p>
								No cal posar accents. Al tauler veuràs les paraules ben
								escrites.
							</p>
							<p>
								Si necessites ajuda, mantén premut Pista per descobrir una
								síl·laba. Pots demanar tantes pistes com vulguis!
							</p>
							<p>
								Les paraules que no són al tauler també compten com a extres.
								Les veuràs quan hagis trobat les cinc paraules del joc.
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button onClick={() => onOpenChange(false)}>Som-hi!</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
