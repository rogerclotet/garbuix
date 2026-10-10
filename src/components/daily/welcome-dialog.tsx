import { Lightbulb, LogIn, MoreVertical, Share, Sparkles } from "lucide-react";
import { useMemo } from "react";
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

type WelcomeDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSignIn: () => void;
};

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
	if (typeof navigator === "undefined") return "other";
	const ua = navigator.userAgent;
	if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
	if (/Android/i.test(ua)) return "android";
	return "other";
}

function isInStandaloneMode(): boolean {
	if (typeof window === "undefined") return false;
	if (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(display-mode: standalone)").matches
	) {
		return true;
	}
	// iOS Safari exposes a non-standard `standalone` flag on the navigator.
	const iosStandalone = (
		window.navigator as Navigator & { standalone?: boolean }
	).standalone;
	return iosStandalone === true;
}

export function WelcomeDialog({
	open,
	onOpenChange,
	onSignIn,
}: WelcomeDialogProps) {
	const platform = useMemo(() => detectPlatform(), []);
	const showPwaTip = useMemo(
		() => platform !== "other" && !isInStandaloneMode(),
		[platform],
	);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle className="text-base">
						Desa el teu progrés
					</AlertDialogTitle>
					<AlertDialogDescription>
						Entra amb un compte i tot el que has jugat fins ara es conserva.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="h-px w-full rounded-full bg-primary/40" aria-hidden />

				<div className="space-y-2 text-sm leading-snug text-muted-foreground font-ui">
					<p>
						Mantens{" "}
						<strong className="font-medium text-foreground">
							la ratxa en tots els teus dispositius
						</strong>
						.
					</p>
					<p className="flex items-start gap-2">
						<Sparkles className="size-4 shrink-0 text-primary" />
						<span>
							Desbloqueges{" "}
							<strong className="font-medium text-foreground">
								pistes descriptives amb IA
							</strong>
							, que t'expliquen cada paraula en comptes de revelar-te una
							lletra.
						</span>
					</p>
					<p>
						<strong className="font-medium text-foreground">
							Sense compte
						</strong>{" "}
						pots continuar jugant igualment, però el progrés es queda en aquest
						navegador i pot perdre's si esborres les dades.
					</p>
				</div>

				{showPwaTip ? (
					<>
						<div
							className="h-px w-full rounded-full bg-primary/40"
							aria-hidden
						/>
						<p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground font-ui">
							<Lightbulb className="size-4 shrink-0 text-primary" />
							<span>
								<strong className="font-medium text-foreground">
									Suggerència:
								</strong>{" "}
								{platform === "ios" ? (
									<>
										pots instal·lar Garbuix! com una app. Al Safari, toca{" "}
										<Share className="inline size-3.5 -mt-0.5" /> i tria{" "}
										<strong className="font-medium text-foreground">
											Afegir a la pantalla d'inici
										</strong>
										.
									</>
								) : (
									<>
										pots instal·lar Garbuix! com una app. Al Chrome, toca{" "}
										<MoreVertical className="inline size-3.5 -mt-0.5" /> i tria{" "}
										<strong className="font-medium text-foreground">
											Instal·lar l'aplicació
										</strong>{" "}
										o{" "}
										<strong className="font-medium text-foreground">
											Afegir a la pantalla d'inici
										</strong>
										.
									</>
								)}
							</span>
						</p>
					</>
				) : null}

				<AlertDialogFooter>
					<AlertDialogCancel>Ara no</AlertDialogCancel>
					<AlertDialogAction onClick={onSignIn}>
						<LogIn className="size-4" />
						Entrar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
