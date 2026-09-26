import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function MiniHelpDialog({
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
					<AlertDialogTitle>Com es juga a Garbuixmini?</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-left">
							<p>Cada dia hi ha cinc paraules curtes per trobar.</p>
							<p>
								Toca les lletres per escriure una paraula i prem el botó de la
								fletxa per comprovar-la. Pots fer servir una lletra més d'una
								vegada.
							</p>
							<p>
								Si necessites ajuda, toca Pista. Apareixerà una lletra al
								tauler. Pots demanar tantes pistes com vulguis!
							</p>
							<p>
								Les paraules es creuen: les lletres que trobis t'ajudaran a
								descobrir les altres. També pots escriure amb el teclat i prémer
								Enter.
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
