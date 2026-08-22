import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import {
	HelpCircle,
	History,
	LogIn,
	LogOut,
	Menu,
	Moon,
	Settings,
	Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { openHowToPlay } from "@/components/daily/how-to-play-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";
import { initialsFromName } from "@/lib/user-profile";

const rootRoute = getRouteApi("__root__");

function ThemeMenuToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const { captureEvent } = useObservability();
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
				captureEvent("theme_preference_changed", { theme: next });
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

export function UserMenu() {
	const rootData = rootRoute.useLoaderData();
	const router = useRouter();
	const { activeUser, session } = useActiveSessionUser(rootData.sessionUser);
	const { captureEvent, resetUser } = useObservability();
	const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

	const triggerLabel = activeUser
		? `Obrir el menú de ${activeUser.name}`
		: "Obrir el menú";
	const imageSrc = activeUser?.image ?? null;
	const showUserImage = Boolean(imageSrc) && failedImageSrc !== imageSrc;
	const avatarInitials = activeUser ? initialsFromName(activeUser.name) : "";

	const handleSignIn = async () => {
		captureEvent("auth_sign_in_started", {
			provider: "google",
		});
		await authClient.signIn.social({
			provider: "google",
			callbackURL: window.location.href,
		});
	};

	const handleSignOut = async () => {
		captureEvent("auth_sign_out_clicked");
		resetUser();
		await authClient.signOut();
		await session.refetch();
		await router.invalidate({ sync: true });
	};

	return (
		<DropdownMenu>
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
						<DropdownMenuLabel className="flex items-center gap-2">
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
								<span className="truncate text-xs font-normal">
									{activeUser.email}
								</span>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
					</>
				) : null}
				<DropdownMenuItem asChild>
					<Link to="/dies-anteriors">
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
					<Link to="/preferencies">
						<Settings className="size-4" />
						<span>Preferències</span>
					</Link>
				</DropdownMenuItem>
				<ThemeMenuToggle />
				<DropdownMenuSeparator />
				{session.isPending ? (
					<DropdownMenuItem disabled>
						<Menu className="size-4" />
						<span>Compte...</span>
					</DropdownMenuItem>
				) : activeUser ? (
					<DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
						<LogOut className="size-4" />
						<span>Tancar sessió</span>
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onSelect={handleSignIn}>
						<LogIn className="size-4" />
						<span>Entrar</span>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
