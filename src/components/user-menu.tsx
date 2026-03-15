import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { EllipsisVertical, History, LogIn, LogOut, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
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
	const { theme, resolvedTheme, setTheme } = useTheme();
	const { activeUser, session } = useActiveSessionUser(rootData.sessionUser);
	const { captureEvent, resetUser } = useObservability();
	const isDark = (resolvedTheme ?? theme) === "dark";

	const triggerLabel = activeUser
		? `Obrir el menú de ${activeUser.name}`
		: "Obrir el menú";

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
					size="icon"
					className="rounded-full text-primary-foreground hover:bg-white/10 hover:text-primary-foreground focus-visible:border-white/30 focus-visible:ring-white/20"
					aria-label={triggerLabel}
				>
					{activeUser?.image ? (
						<Avatar className="size-8 border border-white/20">
							<AvatarImage src={activeUser.image} alt={activeUser.name} />
							<AvatarFallback className="bg-white/10 text-primary-foreground">
								<EllipsisVertical className="size-4" />
							</AvatarFallback>
						</Avatar>
					) : (
						<EllipsisVertical className="size-4" />
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
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
				<DropdownMenuCheckboxItem
					checked={isDark}
					onSelect={(event) => {
						event.preventDefault();
						setTheme(isDark ? "light" : "dark");
					}}
				>
					<Moon className="size-4" />
					<span>Mode fosc</span>
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				{session.isPending ? (
					<DropdownMenuItem disabled>
						<EllipsisVertical className="size-4" />
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
