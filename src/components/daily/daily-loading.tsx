import { Loader2Icon } from "lucide-react";

// Keep stale game content out of the document while preparing a complete board.
export function DailyLoadingPage({
	synchronizing = false,
	onRetry,
}: {
	synchronizing?: boolean;
	onRetry?: () => void;
}) {
	return (
		<div className="relative overflow-hidden" role="status" aria-live="polite">
			<div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-primary/12 to-transparent" />
			<div className="mx-auto flex min-h-[calc(100svh-6rem)] max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
				<div className="rounded-full border border-primary/20 bg-primary/10 p-4 text-primary shadow-sm">
					<Loader2Icon className="size-8 animate-spin" />
				</div>
				<div className="space-y-2">
					<h2 className="text-2xl font-semibold tracking-tight">
						{onRetry
							? "No s'ha pogut carregar el progrés"
							: synchronizing
								? "Sincronitzant el teu progrés"
								: "Carregant el repte d'avui"}
					</h2>
					{onRetry ? (
						<button
							type="button"
							className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
							onClick={onRetry}
						>
							Torna-ho a provar
						</button>
					) : (
						<p className="max-w-md text-sm text-muted-foreground sm:text-base">
							{synchronizing
								? "Estem recuperant les paraules i les pistes que has trobat."
								: "Estem preparant les lletres i les paraules del trencaclosques."}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
