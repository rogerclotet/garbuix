import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
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

type ProfilePreferencesTipDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function ProfilePreferencesTipDialog({
	open,
	onOpenChange,
}: ProfilePreferencesTipDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle className="text-base">
						Personalitza el teu perfil
					</AlertDialogTitle>
					<AlertDialogDescription>
						Pots canviar el teu nom visible i l'avatar des de{" "}
						<strong className="font-medium text-foreground">
							Preferències
						</strong>
						. El nom es mostra a la classificació i quan demanes o dones pistes.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel>Entesos</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Link to="/preferencies">
							<Settings className="size-4" />
							Anar a preferències
						</Link>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
