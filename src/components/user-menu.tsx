import { getRouteApi, Link } from "@tanstack/react-router";
import {
	ChevronRight,
	HelpCircle,
	History,
	Info,
	LogIn,
	Menu,
	MessagesSquare,
	Moon,
	Settings,
	Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { openHowToPlay } from "@/components/daily/how-to-play-store";
import { Logo, QuadratLogo } from "@/components/logo";
import { openSignIn } from "@/components/sign-in/sign-in-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { type GameMode, useRenderedGame } from "@/lib/use-rendered-route";
import { initialsFromName } from "@/lib/user-profile";

const REDDIT_COMMUNITY_URL = "https://www.reddit.com/r/garbuix";

const HISTORY_PATHS = {
	regular: "/dies-anteriors",
	mini: "/mini/dies-anteriors",
	syllables: "/sillabes/dies-anteriors",
	quadrat: "/quadrat/dies-anteriors",
} as const satisfies Record<GameMode, string>;

// The other games, in the order the menu lists them. Garbuix! itself has its
// own entry because returning to it rewinds the browser history. name is the
// word after "Garbuix", drawn in the game's colour.
const OTHER_GAMES = [
	{
		game: "quadrat",
		to: "/quadrat",
		name: "quadrat",
		color: "var(--game-quadrat)",
		Icon: QuadratLogo,
		// A full square of cells outweighs the narrow G at the same size. The
		// padding shrinks it inside the same slot, so the labels stay aligned.
		iconClassName: "size-4 p-0.5",
		beta: true,
	},
	{
		game: "mini",
		to: "/mini",
		name: "mini",
		color: "var(--game-mini)",
		Icon: Logo,
		iconClassName: "size-4",
		beta: false,
	},
	{
		game: "syllables",
		to: "/sillabes",
		name: "síl·labes",
		color: "var(--game-syllables)",
		Icon: Logo,
		iconClassName: "size-4",
		beta: false,
	},
] as const;

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
	const game = useRenderedGame();
	const isRegular = game === "regular";
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
								<span className="min-w-0 truncate text-foreground text-sm">
									{activeUser.name}
								</span>
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
							<DropdownMenuItem onSelect={openSignIn}>
								<LogIn className="size-4" />
								<span>Entrar</span>
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
					</>
				)}
				{isRegular ? (
					<DropdownMenuItem asChild>
						<a
							href={REDDIT_COMMUNITY_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							<MessagesSquare className="size-4" />
							<span>Comunitat de Reddit</span>
						</a>
					</DropdownMenuItem>
				) : null}
				<DropdownMenuItem asChild>
					<Link to={HISTORY_PATHS[game]}>
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
				{isRegular ? (
					<DropdownMenuItem asChild>
						<Link to="/preferencies">
							<Settings className="size-4" />
							<span>Preferències</span>
						</Link>
					</DropdownMenuItem>
				) : null}
				<ThemeMenuToggle />
				<DropdownMenuSeparator />
				{isRegular ? null : (
					<DropdownMenuItem asChild>
						<Link
							to="/"
							onClick={(event) => {
								if (
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
								style={{ color: "var(--game-regular)" }}
								aria-hidden
							/>
							<span>Garbuix!</span>
						</Link>
					</DropdownMenuItem>
				)}
				{OTHER_GAMES.filter((other) => other.game !== game).map((other) => (
					<DropdownMenuItem key={other.game} asChild>
						<Link
							to={other.to}
							aria-label={
								other.beta ? `Garbuix ${other.name}, beta` : undefined
							}
						>
							<other.Icon
								className={other.iconClassName}
								style={{ color: other.color }}
								aria-hidden
							/>
							<span>
								Garbuix <span style={{ color: other.color }}>{other.name}</span>
							</span>
							{other.beta ? (
								<Badge
									className="ml-auto h-4 px-1.5 text-[0.625rem] font-semibold"
									style={{
										color: other.color,
										backgroundColor: `color-mix(in srgb, ${other.color} 14%, transparent)`,
									}}
								>
									Beta
								</Badge>
							) : null}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
