import {
	createFileRoute,
	getRouteApi,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
	getOrCreateAnonIdentity,
	getSkipSharePreview,
	isVibrationEnabled,
	type LetterLayout,
	refreshAnonLeaderboardName,
	setAnonDisplayName,
	setBonusCluesEnabled,
	setLetterLayout,
	setSkipSharePreview,
	setVibrationPreference,
} from "@/lib/anon-identity";
import { getSessionUser, updateUserProfile } from "@/lib/puzzle-server-fns";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";
import {
	DISPLAY_NAME_MAX_LENGTH,
	initialsFromName,
	normalizeDisplayNameInput,
} from "@/lib/user-profile";
import { cn } from "@/lib/utils";

const rootRoute = getRouteApi("__root__");

type ThemePreference = "system" | "light" | "dark";
type AvatarPreference = "google" | "initials";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
	{ value: "system", label: "Sistema" },
	{ value: "light", label: "Clar" },
	{ value: "dark", label: "Fosc" },
];

const LETTER_LAYOUT_OPTIONS: { value: LetterLayout; label: string }[] = [
	{ value: "circle", label: "Cercle" },
	{ value: "grid", label: "Graella" },
];

const PREVIEW_SLOTS = ["n", "ne", "se", "s", "sw", "nw"] as const;

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

function AvatarPreferencePreview({
	preference,
	displayName,
	googleImage,
}: {
	preference: AvatarPreference;
	displayName: string;
	googleImage?: string | null;
}) {
	return (
		<Avatar className="size-12 border border-border">
			{preference === "google" && googleImage ? (
				<AvatarImage
					src={googleImage}
					alt={displayName}
					referrerPolicy="no-referrer"
				/>
			) : (
				<AvatarFallback className="bg-muted text-muted-foreground text-sm">
					{initialsFromName(displayName)}
				</AvatarFallback>
			)}
		</Avatar>
	);
}

export const Route = createFileRoute("/preferencies")({
	component: PreferencesPage,
});

function isLikelyConnectionError(error: unknown): boolean {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		return (
			message.includes("econnreset") ||
			message.includes("aborted") ||
			message.includes("failed to fetch") ||
			message.includes("networkerror") ||
			message.includes("network error") ||
			message.includes("load failed")
		);
	}
	return false;
}

function PreferencesPage() {
	const rootData = rootRoute.useLoaderData();
	const router = useRouter();
	const { activeUser, session } = useActiveSessionUser(rootData.sessionUser);
	const { captureEvent } = useObservability();
	const saveProfile = useServerFn(updateUserProfile);
	const fetchSessionUser = useServerFn(getSessionUser);
	const sharePreviewToggleId = useId();
	const vibrationToggleId = useId();
	const letterLayoutGroupId = useId();
	const bonusCluesToggleId = useId();
	const themeSelectId = useId();
	const displayNameInputId = useId();
	const avatarPreferenceGroupId = useId();
	const { theme, setTheme } = useTheme();
	const [showSharePreview, setShowSharePreview] = useState(true);
	const [vibrationEnabled, setVibrationEnabled] = useState(true);
	const [letterLayout, setLetterLayoutState] = useState<LetterLayout>("circle");
	const [bonusCluesEnabled, setBonusCluesEnabledState] = useState(true);
	const [displayName, setDisplayName] = useState("");
	const [avatarPreference, setAvatarPreferenceState] =
		useState<AvatarPreference>("initials");
	const [profileSaving, setProfileSaving] = useState(false);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [profileSaved, setProfileSaved] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setShowSharePreview(!getSkipSharePreview());
		setVibrationEnabled(isVibrationEnabled());
		setLetterLayoutState(getLetterLayout());
		setBonusCluesEnabledState(getBonusCluesEnabled());
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!mounted) {
			return;
		}
		if (activeUser) {
			setDisplayName(activeUser.name);
			setAvatarPreferenceState(
				activeUser.useGoogleAvatar === false ? "initials" : "google",
			);
		} else {
			setDisplayName(getOrCreateAnonIdentity().name);
			setAvatarPreferenceState("initials");
		}
		setProfileError(null);
		setProfileSaved(false);
	}, [activeUser, mounted]);

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

	const handleAvatarPreferenceChange = (next: AvatarPreference) => {
		setAvatarPreferenceState(next);
		setProfileSaved(false);
	};

	const handleSaveProfile = async () => {
		const normalized = normalizeDisplayNameInput(displayName);
		if (!normalized) {
			setProfileError(
				`Introdueix un nom d'entre 1 i ${DISPLAY_NAME_MAX_LENGTH} caràcters, amb lletres vàlides.`,
			);
			return;
		}

		setProfileSaving(true);
		setProfileError(null);
		setProfileSaved(false);

		const refreshAuthenticatedProfile = async () => {
			await session.refetch();
			await router.invalidate();
		};

		const profileMatchesSavedState = async () => {
			const refreshed = await fetchSessionUser();
			if (!refreshed) {
				return false;
			}
			const avatarMatches =
				avatarPreference === "google"
					? refreshed.useGoogleAvatar !== false
					: refreshed.useGoogleAvatar === false;
			return refreshed.name === normalized && avatarMatches;
		};

		const markProfileSaved = () => {
			setDisplayName(normalized);
			captureEvent("profile_updated", {
				is_authenticated: Boolean(activeUser),
				avatar_preference: avatarPreference,
			});
			setProfileSaved(true);
		};

		try {
			if (activeUser) {
				try {
					await saveProfile({
						data: {
							displayName: normalized,
							useGoogleAvatar: avatarPreference === "google",
						},
					});
				} catch (error) {
					if (!isLikelyConnectionError(error)) {
						throw error;
					}
					if (!(await profileMatchesSavedState())) {
						throw error;
					}
				}
				await refreshAuthenticatedProfile();
			} else {
				if (!setAnonDisplayName(normalized)) {
					setProfileError(
						`Introdueix un nom d'entre 1 i ${DISPLAY_NAME_MAX_LENGTH} caràcters.`,
					);
					return;
				}
				await refreshAnonLeaderboardName(normalized);
			}

			markProfileSaved();
		} catch {
			setProfileError("No s'ha pogut desar el perfil. Torna-ho a provar.");
		} finally {
			setProfileSaving(false);
		}
	};

	const themeValue: ThemePreference = mounted
		? ((theme as ThemePreference | undefined) ?? "system")
		: "system";
	const canChooseGoogleAvatar = Boolean(activeUser?.googleImage);
	const previewName = displayName.trim() || "Convidat";

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
			<p className="text-muted-foreground text-sm">
				Ajusta com vols jugar i compartir el teu progrés.
			</p>
			<section className="rounded-xl border border-border/40 bg-muted/30 divide-y divide-border/40">
				<div className="flex flex-col gap-4 p-4 sm:p-5">
					<div className="space-y-1">
						<label htmlFor={displayNameInputId} className="font-medium">
							Nom visible
						</label>
						<p className="text-sm text-muted-foreground font-ui">
							Aquest nom es mostra a la classificació i quan demanes pistes.
						</p>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start">
						<Input
							id={displayNameInputId}
							value={displayName}
							maxLength={DISPLAY_NAME_MAX_LENGTH}
							onChange={(event) => {
								setDisplayName(event.target.value);
								setProfileSaved(false);
								setProfileError(null);
							}}
							className="sm:max-w-xs"
						/>
						<Button
							type="button"
							onClick={handleSaveProfile}
							disabled={profileSaving}
							className="shrink-0"
						>
							{profileSaving ? "Desant..." : "Desa el perfil"}
						</Button>
					</div>
					{profileError ? (
						<p className="text-destructive text-sm">{profileError}</p>
					) : null}
					{profileSaved ? (
						<p className="text-muted-foreground text-sm">Perfil desat.</p>
					) : null}
					{canChooseGoogleAvatar ? (
						<div className="flex flex-col gap-3 pt-1">
							<div className="space-y-1">
								<div id={avatarPreferenceGroupId} className="font-medium">
									Avatar
								</div>
								<p className="text-sm text-muted-foreground font-ui">
									Tria si vols mostrar la foto de Google o l'avatar de convidat
									amb les inicials.
								</p>
							</div>
							<fieldset
								aria-labelledby={avatarPreferenceGroupId}
								className="flex gap-3 border-0 p-0 m-0"
							>
								{(
									[
										{ value: "google", label: "Google" },
										{ value: "initials", label: "Convidat" },
									] as const
								).map((option) => {
									const selected = avatarPreference === option.value;
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
												name="avatar-preference"
												value={option.value}
												checked={selected}
												onChange={() =>
													handleAvatarPreferenceChange(option.value)
												}
												className="sr-only"
											/>
											<AvatarPreferencePreview
												preference={option.value}
												displayName={previewName}
												googleImage={activeUser?.googleImage}
											/>
											<span className="text-sm font-medium font-ui">
												{option.label}
											</span>
										</label>
									);
								})}
							</fieldset>
						</div>
					) : null}
				</div>
			</section>
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
