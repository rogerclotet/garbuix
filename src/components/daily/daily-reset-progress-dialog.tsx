import { RotateCcw } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DailyResetProgressDialogProps = {
	hasProgress: boolean;
	onReset: () => void;
};

export function DailyResetProgressDialog({
	hasProgress,
	onReset,
}: DailyResetProgressDialogProps) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="border-border/70 bg-background/60 text-muted-foreground hover:text-foreground"
					disabled={!hasProgress}
				>
					<RotateCcw className="w-3.5 h-3.5" />
					Reiniciar progrés d'avui
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Reiniciar el progrés d'avui?</AlertDialogTitle>
					<AlertDialogDescription>
						Això esborrarà les paraules trobades, els intents i les pistes
						utilitzades d'avui.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel·lar</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onReset}>
						Reiniciar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
