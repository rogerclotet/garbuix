import { createFileRoute } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	getLeaderboardOptOut,
	getSkipSharePreview,
	setLeaderboardOptOut,
	setSkipSharePreview,
} from "@/lib/anon-identity";
import { useObservability } from "@/lib/use-observability";

type ThemePreference = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
	{ value: "system", label: "Sistema" },
	{ value: "light", label: "Clar" },
	{ value: "dark", label: "Fosc" },
];

export const Route = createFileRoute("/preferencies")({
	component: PreferencesPage,
});

function PreferencesPage() {
	const { captureEvent } = useObservability();
	const leaderboardToggleId = useId();
	const sharePreviewToggleId = useId();
	const themeSelectId = useId();
	const { theme, setTheme } = useTheme();
	const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
	const [showSharePreview, setShowSharePreview] = useState(true);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setShowOnLeaderboard(!getLeaderboardOptOut());
		setShowSharePreview(!getSkipSharePreview());
		setMounted(true);
	}, []);

	const handleToggleLeaderboard = (next: boolean) => {
		setShowOnLeaderboard(next);
		setLeaderboardOptOut(!next);
		captureEvent("leaderboard_opt_out_toggled", { opt_out: !next });
	};

	const handleToggleSharePreview = (next: boolean) => {
		setShowSharePreview(next);
		setSkipSharePreview(!next);
		captureEvent("share_preview_toggled", { skip: !next });
	};

	const handleThemeChange = (next: string) => {
		const value = next as ThemePreference;
		setTheme(value);
		captureEvent("theme_preference_changed", { theme: value });
	};

	const themeValue: ThemePreference = mounted
		? ((theme as ThemePreference | undefined) ?? "system")
		: "system";

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
			<p className="text-muted-foreground text-sm">
				Ajusta com vols jugar i compartir el teu progrés.
			</p>
			<section className="rounded-xl border border-border/40 bg-muted/30 divide-y divide-border/40">
				<div className="flex items-start justify-between gap-4 p-4 sm:p-5">
					<div className="space-y-1">
						<label htmlFor={themeSelectId} className="font-medium">
							Tema
						</label>
						<p className="text-sm text-muted-foreground font-ui">
							Tria si vols seguir el tema del sistema o forçar el mode clar o
							fosc.
						</p>
					</div>
					<Select value={themeValue} onValueChange={handleThemeChange}>
						<SelectTrigger id={themeSelectId} className="w-32 shrink-0">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{THEME_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<label
					htmlFor={leaderboardToggleId}
					className="flex items-start justify-between gap-4 p-4 sm:p-5 cursor-pointer"
				>
					<div className="space-y-1">
						<div className="font-medium">Mostra'm a la classificació</div>
						<p className="text-sm text-muted-foreground font-ui">
							Apareix al rànquing diari amb el teu nom o àlies. Si ho
							desactives, els teus resultats no es publicaran.
						</p>
					</div>
					<Switch
						id={leaderboardToggleId}
						checked={showOnLeaderboard}
						onCheckedChange={handleToggleLeaderboard}
					/>
				</label>
				<label
					htmlFor={sharePreviewToggleId}
					className="flex items-start justify-between gap-4 p-4 sm:p-5 cursor-pointer"
				>
					<div className="space-y-1">
						<div className="font-medium">
							Mostra la vista prèvia abans de compartir
						</div>
						<p className="text-sm text-muted-foreground font-ui">
							Abans de compartir el progrés, mostra una vista prèvia de la
							imatge. Si ho desactives, el diàleg per compartir s'obrirà
							directament.
						</p>
					</div>
					<Switch
						id={sharePreviewToggleId}
						checked={showSharePreview}
						onCheckedChange={handleToggleSharePreview}
					/>
				</label>
			</section>
		</div>
	);
}
