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
	getBonusCluesEnabled,
	getLetterLayout,
	getSkipSharePreview,
	isVibrationEnabled,
	type LetterLayout,
	setBonusCluesEnabled,
	setLetterLayout,
	setSkipSharePreview,
	setVibrationPreference,
} from "@/lib/anon-identity";
import { useObservability } from "@/lib/use-observability";
import { cn } from "@/lib/utils";

type ThemePreference = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
	{ value: "system", label: "Sistema" },
	{ value: "light", label: "Clar" },
	{ value: "dark", label: "Fosc" },
];

const LETTER_LAYOUT_OPTIONS: { value: LetterLayout; label: string }[] = [
	{ value: "circle", label: "Cercle" },
	{ value: "grid", label: "Graella" },
];

// Stable slot keys for the six preview dots; mirrors the six letter buttons the
// daily controls lay out. Reused for both layouts so neither relies on an array
// index as a React key.
const PREVIEW_SLOTS = ["n", "ne", "se", "s", "sw", "nw"] as const;

// Miniature of each layout so the choice is self-explanatory: dots in a ring for
// "circle" (matching the radial placement in daily-controls.tsx) and a 3×2 grid
// for "grid".
function LetterLayoutPreview({ layout }: { layout: LetterLayout }) {
	if (layout === "grid") {
		return (
			<div className="grid grid-cols-3 gap-1">
				{PREVIEW_SLOTS.map((slot) => (
					<div
						key={slot}
						className="h-3.5 w-3.5 rounded-sm border border-border bg-background"
					/>
				))}
			</div>
		);
	}

	return (
		<div className="relative h-16 w-16">
			<div className="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
			{PREVIEW_SLOTS.map((slot, index) => {
				const angle =
					(index / PREVIEW_SLOTS.length) * 2 * Math.PI - Math.PI / 2;
				const x = Math.cos(angle) * 1.55;
				const y = Math.sin(angle) * 1.55;
				return (
					<div
						key={slot}
						className="absolute h-3.5 w-3.5 rounded-full border border-border bg-background"
						style={{
							left: "50%",
							top: "50%",
							transform: `translate(calc(-50% + ${x}rem), calc(-50% + ${y}rem))`,
						}}
					/>
				);
			})}
		</div>
	);
}

export const Route = createFileRoute("/preferencies")({
	component: PreferencesPage,
});

function PreferencesPage() {
	const { captureEvent } = useObservability();
	const sharePreviewToggleId = useId();
	const vibrationToggleId = useId();
	const letterLayoutGroupId = useId();
	const bonusCluesToggleId = useId();
	const themeSelectId = useId();
	const { theme, setTheme } = useTheme();
	const [showSharePreview, setShowSharePreview] = useState(true);
	const [vibrationEnabled, setVibrationEnabled] = useState(true);
	const [letterLayout, setLetterLayoutState] = useState<LetterLayout>("circle");
	const [bonusCluesEnabled, setBonusCluesEnabledState] = useState(true);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setShowSharePreview(!getSkipSharePreview());
		setVibrationEnabled(isVibrationEnabled());
		setLetterLayoutState(getLetterLayout());
		setBonusCluesEnabledState(getBonusCluesEnabled());
		setMounted(true);
	}, []);

	const handleToggleSharePreview = (next: boolean) => {
		setShowSharePreview(next);
		setSkipSharePreview(!next);
		captureEvent("share_preview_toggled", { skip: !next });
	};

	const handleToggleVibration = (next: boolean) => {
		setVibrationEnabled(next);
		setVibrationPreference(next);
		captureEvent("vibration_toggled", { enabled: next });
	};

	const handleLayoutChange = (next: LetterLayout) => {
		setLetterLayoutState(next);
		setLetterLayout(next);
		captureEvent("letter_layout_changed", { layout: next });
	};

	const handleToggleBonusClues = (next: boolean) => {
		setBonusCluesEnabledState(next);
		setBonusCluesEnabled(next);
		captureEvent("bonus_clues_toggled", { enabled: next });
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
				<label
					htmlFor={vibrationToggleId}
					className="flex items-start justify-between gap-4 p-4 sm:p-5 cursor-pointer"
				>
					<div className="space-y-1">
						<div className="font-medium">Vibració</div>
						<p className="text-sm text-muted-foreground font-ui">
							Fes vibrar el dispositiu en encertar paraules i altres accions. Si
							no tries res, seguim la preferència de moviment reduït del teu
							dispositiu.
						</p>
					</div>
					<Switch
						id={vibrationToggleId}
						checked={vibrationEnabled}
						onCheckedChange={handleToggleVibration}
					/>
				</label>
				<div className="flex flex-col gap-3 p-4 sm:p-5">
					<div className="space-y-1">
						<div id={letterLayoutGroupId} className="font-medium">
							Disposició de les lletres
						</div>
						<p className="text-sm text-muted-foreground font-ui">
							Tria com es col·loquen les lletres per escriure: en cercle al
							voltant del botó d'enviar o en una graella de tres columnes.
						</p>
					</div>
					<fieldset
						aria-labelledby={letterLayoutGroupId}
						className="flex gap-3 border-0 p-0 m-0"
					>
						{LETTER_LAYOUT_OPTIONS.map((option) => {
							const selected = letterLayout === option.value;
							return (
								<label
									key={option.value}
									className={cn(
										"flex flex-1 flex-col items-center gap-2 rounded-lg border p-3 transition-colors cursor-pointer",
										selected
											? "border-primary ring-2 ring-primary bg-background"
											: "border-border bg-background hover:border-primary/50",
									)}
								>
									<input
										type="radio"
										name="letter-layout"
										value={option.value}
										checked={selected}
										onChange={() => handleLayoutChange(option.value)}
										className="sr-only"
									/>
									<div className="flex h-20 items-center justify-center">
										<LetterLayoutPreview layout={option.value} />
									</div>
									<span className="text-sm font-medium font-ui">
										{option.label}
									</span>
								</label>
							);
						})}
					</fieldset>
				</div>
				<label
					htmlFor={bonusCluesToggleId}
					className="flex items-start justify-between gap-4 p-4 sm:p-5 cursor-pointer"
				>
					<div className="space-y-1">
						<div className="font-medium">Pistes per paraules extra</div>
						<p className="text-sm text-muted-foreground font-ui">
							Cada 10 paraules vàlides que no siguin del trencaclosques, et
							revelem una lletra a l'atzar. Desactiva-ho per a una experiència
							més difícil.
						</p>
					</div>
					<Switch
						id={bonusCluesToggleId}
						checked={bonusCluesEnabled}
						onCheckedChange={handleToggleBonusClues}
					/>
				</label>
			</section>
		</div>
	);
}
