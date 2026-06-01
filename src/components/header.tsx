import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, HelpingHand } from "lucide-react";
import { HowToPlayDialog } from "@/components/daily/how-to-play-dialog";
import {
	setHowToPlayOpen,
	useHowToPlayOpen,
} from "@/components/daily/how-to-play-store";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { WORD_LIST_SECTION_ID } from "@/lib/clue-request-types";
import { useClueRequests } from "@/lib/use-clue-requests";

const INNER_PAGE_TITLES: Record<string, string> = {
	"/classificacio": "Classificació",
	"/dies-anteriors": "Dies anteriors",
	"/preferencies": "Preferències",
};

export default function Header() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const innerTitle = INNER_PAGE_TITLES[pathname];
	const howToPlayOpen = useHowToPlayOpen();
	const navigate = useNavigate();
	const { incomingRequests } = useClueRequests();
	// "How many players are requesting help" — distinct askers, not raw requests.
	const helpRequestCount = new Set(
		incomingRequests.map((request) => request.requesterId),
	).size;

	const goToWordList = () => {
		const scrollToWordList = () => {
			document
				.getElementById(WORD_LIST_SECTION_ID)
				?.scrollIntoView({ behavior: "smooth", block: "start" });
		};
		if (pathname === "/") {
			scrollToWordList();
			return;
		}
		void navigate({ to: "/" }).then(() => {
			window.setTimeout(scrollToWordList, 150);
		});
	};

	return (
		<header className="bg-background transition-colors duration-300">
			<div className="max-w-5xl mx-auto px-3 sm:px-4 pb-1 sm:pb-1.5 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				<div className="flex items-center justify-between gap-2">
					{innerTitle ? (
						<div className="flex min-w-0 items-center gap-1 sm:gap-2">
							<Button
								variant="ghost"
								size="icon-lg"
								asChild
								className="size-11 -ml-2 rounded-full text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20 sm:size-9 sm:-ml-1"
							>
								<Link to="/" aria-label="Tornar">
									<ChevronLeft className="size-6 sm:size-5" />
								</Link>
							</Button>
							<h1 className="truncate text-xl sm:text-2xl font-bold text-primary">
								{innerTitle}
							</h1>
						</div>
					) : (
						<Link
							to="/"
							className="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<Logo className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
							<h1 className="text-xl sm:text-2xl font-bold text-primary">
								Garbuix!
							</h1>
						</Link>
					)}
					<div className="flex items-center gap-2">
						{helpRequestCount > 0 ? (
							<Button
								variant="ghost"
								size="icon-lg"
								onClick={goToWordList}
								className="relative size-11 rounded-full text-foreground hover:bg-muted sm:size-9"
								aria-label={`${helpRequestCount} ${
									helpRequestCount === 1
										? "jugador demana ajuda"
										: "jugadors demanen ajuda"
								}`}
							>
								<HelpingHand className="size-6 sm:size-5" />
								<span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground tabular-nums">
									{helpRequestCount > 9 ? "9+" : helpRequestCount}
								</span>
							</Button>
						) : null}
						<UserMenu />
					</div>
				</div>
			</div>
			<HowToPlayDialog open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />
		</header>
	);
}
