import { getRouteApi } from "@tanstack/react-router";
import {
	CornerDownLeft,
	Delete,
	Lightbulb,
	Shuffle,
	Trophy,
} from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveSessionUser } from "@/lib/use-active-session-user";

const rootRoute = getRouteApi("__root__");

type HowToPlayDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function ControlRow({
	icon,
	title,
	description,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
}) {
	return (
		<div className="flex items-start gap-3">
			<div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md text-foreground">
				{icon}
			</div>
			<div className="space-y-0.5">
				<div className="text-sm font-medium leading-tight">{title}</div>
				<p className="text-muted-foreground text-sm leading-snug font-ui">
					{description}
				</p>
			</div>
		</div>
	);
}

export function HowToPlayDialog({ open, onOpenChange }: HowToPlayDialogProps) {
	const rootData = rootRoute.useLoaderData();
	const { activeUser } = useActiveSessionUser(rootData.sessionUser);
	const hintDescription = activeUser
		? "Et dona una pista descriptiva per a una paraula que encara no has trobat. Tens 3 pistes per partida."
		: "Revela una lletra al tauler. Tens 3 pistes per partida.";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle className="text-base">Com s'hi juga</AlertDialogTitle>
					<AlertDialogDescription>
						Forma paraules de 4 lletres o més amb les lletres del dia. Cada
						paraula encertada es revela a la quadrícula.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-3 pt-1">
					<ControlRow
						icon={<span className="text-sm font-bold tracking-tight">Aa</span>}
						title="Toca les lletres"
						description="O escriu amb el teclat. Forma una paraula de com a mínim 4 lletres."
					/>
					<ControlRow
						icon={<CornerDownLeft className="size-4" />}
						title="Envia la paraula"
						description="Toca el botó d'enviar (o prem Enter / espai) per comprovar-la."
					/>
					<ControlRow
						icon={<Delete className="size-4" />}
						title="Esborra una lletra"
						description="Treu l'última lletra del que estàs escrivint."
					/>
					<ControlRow
						icon={<Lightbulb className="size-4 text-amber-500" />}
						title="Mantén premut per una pista"
						description={hintDescription}
					/>
					<ControlRow
						icon={<Shuffle className="size-4" />}
						title="Barreja les lletres"
						description="Reordena les lletres si necessites una nova perspectiva."
					/>
					<ControlRow
						icon={<Trophy className="size-4 text-amber-500" />}
						title="Puja a la classificació"
						description="Completa el garbuix amb menys pistes per encapçalar-la. Si empateu, desempata qui fa menys intents i, si tot continua igual, qui acaba abans."
					/>
				</div>

				<AlertDialogFooter>
					<AlertDialogAction>Som-hi!</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
