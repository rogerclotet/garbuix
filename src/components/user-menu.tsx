import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import {
	HelpCircle,
	History,
	LogIn,
	LogOut,
	Menu,
	Settings,
} from "lucide-react";
import { useState } from "react";
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
import { authClient } from "@/lib/auth-client";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";

const rootRoute = getRouteApi("__root__");

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
					{activeUser ? (
						<Avatar className="size-10 border border-border sm:size-9">
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
								<AvatarFallback className="bg-muted text-muted-foreground">
									<Menu className="size-5 sm:size-4" />
								</AvatarFallback>
							)}
						</Avatar>
					) : (
						<Menu className="size-5 sm:size-4" />
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-[min(15rem,calc(100vw-1rem))] sm:w-56"
			>
				{activeUser ? (
					<>
						<DropdownMenuLabel className="flex flex-col gap-0.5">
							<span className="text-foreground text-sm">{activeUser.name}</span>
							<span className="text-xs font-normal">{activeUser.email}</span>
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
