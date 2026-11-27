import { CircleAlertIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

// Keep stale game content out of the document while preparing a complete board.
export function PuzzleLoadingPage({
	synchronizing = false,
	onRetry,
}: {
	synchronizing?: boolean;
	onRetry?: () => void;
}) {
	return (
		<div className="grid min-h-full content-center justify-items-center gap-4 px-4 pt-6 pb-10 text-center">
			<div
				aria-hidden="true"
				className={`grid size-[6.375rem] place-items-center rounded-[2rem] ${onRetry ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
			>
				{onRetry ? (
					<CircleAlertIcon className="size-6" />
				) : (
					<Logo className="puzzle-loading-logo h-[4.125rem] w-auto overflow-visible" />
				)}
			</div>
			<div className="max-w-xs">
				<div role="status" className="space-y-1.5">
					<h2 className="text-balance text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
						{onRetry
							? "No s'ha pogut carregar el progrés"
							: synchronizing
								? "Sincronitzant el teu progrés"
								: "Carregant el repte d'avui"}
					</h2>
					{!onRetry && (
						<p className="text-pretty text-sm text-muted-foreground">
							{synchronizing
								? "Estem recuperant les paraules i les pistes que has trobat."
								: "Estem preparant el tauler."}
						</p>
					)}
				</div>
				{onRetry && (
					<Button
						type="button"
						size="lg"
						className="mt-3 rounded-full px-5 font-extrabold"
						onClick={onRetry}
					>
						Torna-ho a provar
					</Button>
				)}
			</div>
		</div>
	);
}
