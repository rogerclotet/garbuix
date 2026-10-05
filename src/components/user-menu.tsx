import { getRouteApi, Link } from "@tanstack/react-router";
import {
	ChevronRight,
	HelpCircle,
	History,
	Info,
	LogIn,
	Menu,
	Moon,
	Settings,
	ShieldCheck,
	Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { openHowToPlay } from "@/components/daily/how-to-play-store";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useMiniRoute } from "@/lib/use-mini-route";
import { useSyllableRoute } from "@/lib/use-syllable-route";
import { initialsFromName } from "@/lib/user-profile";

const rootRoute = getRouteApi("__root__");

function ThemeMenuToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const isDark = mounted && resolvedTheme === "dark";

	return (
		<DropdownMenuItem
			onSelect={(event) => {
				event.preventDefault();
				const next = isDark ? "light" : "dark";
				setTheme(next);
			}}
		>
			{isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
			<span>Mode fosc</span>
			<Switch
				checked={isDark}
				aria-hidden
				tabIndex={-1}
				className="pointer-events-none ml-auto"
			/>
		</DropdownMenuItem>
	);
}

export function UserMenu({
	onReturnToGarbuix,
}: {
	onReturnToGarbuix: () => void;
}) {
	const mini = useMiniRoute();
	const syllables = useSyllableRoute();
	const rootData = rootRoute.useLoaderData();
	const { activeUser, session } = useActiveSessionUser(rootData.sessionUser);
	const [open, setOpen] = useState(false);
	const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

	const triggerLabel = activeUser
		? `Obrir el menú de ${activeUser.name}`
		: "Obrir el menú";
	const imageSrc = activeUser?.image ?? null;
	const showUserImage = Boolean(imageSrc) && failedImageSrc !== imageSrc;
	const avatarInitials = activeUser ? initialsFromName(activeUser.name) : "";

	const handleSignIn = async () => {
		await authClient.signIn.social({
			provider: "google",
			callbackURL: window.location.href,
		});
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-lg"
					className="size-11 rounded-full text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20 sm:size-9"
					aria-label={triggerLabel}
				>
					<Menu className="size-5 sm:size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-[min(15rem,calc(100vw-1rem))] sm:w-56"
			>
				{activeUser ? (
					<>
						<DropdownMenuItem asChild className="gap-2 font-medium sm:gap-2">
							<Link to="/preferencies" aria-label="Obrir el perfil">
								<Avatar className="size-8 shrink-0 border border-border">
									{showUserImage ? (
										<AvatarImage
											src={activeUser.image ?? undefined}
											alt={activeUser.name}
											referrerPolicy="no-referrer"
											onError={() => {
												setFailedImageSrc(imageSrc);
											}}
										/>
									) : (
										<AvatarFallback className="bg-muted text-muted-foreground text-xs">
											{avatarInitials}
										</AvatarFallback>
									)}
								</Avatar>
								<div className="flex min-w-0 flex-col gap-0.5">
									<span className="truncate text-foreground text-sm">
										{activeUser.name}
									</span>
									<span className="truncate text-xs font-normal text-muted-foreground">
										{activeUser.email}
									</span>
								</div>
								<ChevronRight className="ml-auto size-4" />
							</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				) : (
					<>
						{session.isPending ? (
							<DropdownMenuItem disabled>
								<Menu className="size-4" />
								<span>Compte...</span>
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem onSelect={handleSignIn}>
								<LogIn className="size-4" />
								<span>Entrar</span>
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem asChild>
					<Link
						to={
							syllables
								? "/sillabes/dies-anteriors"
								: mini
									? "/mini/dies-anteriors"
									: "/dies-anteriors"
						}
					>
						<History className="size-4" />
						<span>Historial</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => {
						openHowToPlay();
					}}
				>
					<HelpCircle className="size-4" />
					<span>Com s'hi juga</span>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/sobre-el-joc">
						<Info className="size-4" />
						<span>Sobre el joc</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/privacitat">
						<ShieldCheck className="size-4" />
						<span>Privacitat</span>
					</Link>
				</DropdownMenuItem>
				{!mini && !syllables ? (
					<DropdownMenuItem asChild>
						<Link to="/preferencies">
							<Settings className="size-4" />
							<span>Preferències</span>
						</Link>
					</DropdownMenuItem>
				) : null}
				<ThemeMenuToggle />
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link
						to={mini || syllables ? "/" : "/mini"}
						onClick={(event) => {
							if (
								(mini || syllables) &&
								event.button === 0 &&
								!event.metaKey &&
								!event.ctrlKey &&
								!event.shiftKey &&
								!event.altKey
							) {
								event.preventDefault();
								setOpen(false);
								onReturnToGarbuix();
							}
						}}
					>
						<Logo
							className="size-4"
							style={{
								color:
									mini || syllables
										? "var(--game-regular)"
										: "var(--game-mini)",
							}}
							aria-hidden
						/>
						<span>{mini || syllables ? "Garbuix!" : "Garbuix mini"}</span>
					</Link>
				</DropdownMenuItem>
				{syllables ? (
					<DropdownMenuItem asChild>
						<Link to="/mini">
							<Logo
								className="size-4"
								style={{ color: "var(--game-mini)" }}
								aria-hidden
							/>
							<span>Garbuix mini</span>
						</Link>
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem asChild>
						<Link to="/sillabes">
							<Logo
								className="size-4"
								style={{ color: "var(--game-syllables)" }}
								aria-hidden
							/>
							<span>Garbuix síl·labes</span>
						</Link>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
