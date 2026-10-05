import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { ChevronLeft, HelpingHand, Share2, Trophy } from "lucide-react";
import { useDailyHeaderSummary } from "@/components/daily/daily-header-store";
import { HowToPlayDialog } from "@/components/daily/how-to-play-dialog";
import {
	setHowToPlayOpen,
	useHowToPlayOpen,
} from "@/components/daily/how-to-play-store";
import { Logo } from "@/components/logo";
import { MiniHelpDialog } from "@/components/mini/mini-help-dialog";
import { ProfilePreferencesTipDialog } from "@/components/profile-preferences-tip-dialog";
import {
	setProfilePreferencesTipOpen,
	useProfilePreferencesTipOpen,
} from "@/components/profile-preferences-tip-store";
import { SyllableHelpDialog } from "@/components/syllables/syllable-help-dialog";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { WORD_LIST_SECTION_ID, wordRowId } from "@/lib/clue-request-types";
import { getGameHistory } from "@/lib/game-history";
import { useClueRequests } from "@/lib/use-clue-requests";
import { useMiniRoute } from "@/lib/use-mini-route";
import { useSyllableRoute } from "@/lib/use-syllable-route";

const INNER_PAGE_TITLES: Record<string, string> = {
	"/classificacio": "Classificació",
	"/dies-anteriors": "Dies anteriors",
	"/preferencies": "Preferències",
	"/sobre-el-joc": "Sobre el joc",
	"/privacitat": "Privacitat",
	"/mini/dies-anteriors": "Historial mini",
	"/sillabes/dies-anteriors": "Historial síl·labes",
};

export default function Header() {
	const mini = useMiniRoute();
	const syllables = useSyllableRoute();
	const gamePath = syllables ? "/sillabes" : mini ? "/mini" : "/";
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const location = useRouterState({ select: (s) => s.location });
	const historyIndex = location.state.__TSR_index;
	const gameHistoryIndices = getGameHistory(location);

	const innerTitle = INNER_PAGE_TITLES[pathname];
	const howToPlayOpen = useHowToPlayOpen();
	const profilePreferencesTipOpen = useProfilePreferencesTipOpen();
	const dailySummary = useDailyHeaderSummary();
	const navigate = useNavigate();
	const router = useRouter();
	const { incomingRequests } = useClueRequests();
	// "How many players are requesting help" — distinct askers, not raw requests.
	const helpRequestCount = new Set(
		incomingRequests.map((request) => request.requesterId),
	).size;

	const goToWordList = () => {
		// Scroll straight to the first requested word's row. scrollIntoView walks
		// every scrollable ancestor, so it also moves the word list's own inner
		// scroll on desktop — not just the page. Falls back to the section header.
		const firstWordId = incomingRequests[0]?.wordId;
		const scrollToTarget = () => {
			const target =
				(firstWordId != null
					? document.getElementById(wordRowId(firstWordId))
					: null) ?? document.getElementById(WORD_LIST_SECTION_ID);
			target?.scrollIntoView({ behavior: "smooth", block: "center" });
		};
		if (pathname === "/") {
			scrollToTarget();
			return;
		}
		void navigate({ to: "/" }).then(() => {
			window.setTimeout(scrollToTarget, 150);
		});
	};

	const returnToGame = (to: "/" | "/mini" | "/sillabes") => {
		const gameHistoryIndex = gameHistoryIndices[to];

		// Reuse the game entry so Back cannot revisit the pages we're leaving.
		if (gameHistoryIndex !== undefined && historyIndex > gameHistoryIndex) {
			router.history.go(gameHistoryIndex - historyIndex);
			return;
		}

		// A direct link has no known game entry to rewind to.
		void navigate({ to, replace: true });
	};

	// Share / trophy / help badge / avatar. The share action is the one the
	// progress meters used to own. Inner pages (classificació, dies anteriors,
	// preferències) drop the share and ranking actions entirely.
	const actionButtons = (showNav: boolean) => (
		<div className="flex items-center gap-1">
			{showNav && dailySummary ? (
				<Button
					variant="ghost"
					size="icon"
					onClick={dailySummary.onShare}
					className="rounded-full size-10 text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20 sm:size-9"
					aria-label="Compartir progrés"
				>
					<Share2 className="size-5" />
				</Button>
			) : null}
			{showNav && pathname !== "/classificacio" ? (
				<Button
					variant="ghost"
					size="icon"
					asChild
					className="rounded-full size-10 text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20 sm:size-9"
				>
					<Link to="/classificacio" aria-label="Classificació">
						<Trophy className="size-5" />
					</Link>
				</Button>
			) : null}
			{pathname === "/" && helpRequestCount > 0 ? (
				<Button
					variant="ghost"
					size="icon"
					onClick={goToWordList}
					className="relative rounded-full size-10 text-foreground hover:bg-muted sm:size-9"
					aria-label={`${helpRequestCount} ${
						helpRequestCount === 1
							? "jugador demana ajuda"
							: "jugadors demanen ajuda"
					}`}
				>
					<HelpingHand className="size-5" />
					<span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground tabular-nums">
						{helpRequestCount > 9 ? "9+" : helpRequestCount}
					</span>
				</Button>
			) : null}
			<UserMenu onReturnToGarbuix={() => returnToGame("/")} />
		</div>
	);

	const dialogs = (
		<>
			{syllables ? (
				<SyllableHelpDialog
					open={howToPlayOpen}
					onOpenChange={setHowToPlayOpen}
				/>
			) : mini ? (
				<MiniHelpDialog open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />
			) : (
				<HowToPlayDialog open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />
			)}
			<ProfilePreferencesTipDialog
				open={profilePreferencesTipOpen}
				onOpenChange={setProfilePreferencesTipOpen}
			/>
		</>
	);

	return (
		<header className="bg-background transition-colors duration-300">
			<div className="max-w-5xl mx-auto px-3 sm:px-4 pb-1 sm:pb-1.5 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				<div className="flex items-center justify-between gap-2">
					{innerTitle ? (
						<div className="flex min-w-0 items-center gap-1 sm:gap-2">
							<Button
								variant="ghost"
								size="icon-lg"
								onClick={() => returnToGame(gamePath)}
								className="size-11 -ml-2 rounded-full text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20 sm:size-9 sm:-ml-1"
								aria-label="Tornar"
							>
								<ChevronLeft className="size-6 sm:size-5" />
							</Button>
							<h1 className="truncate text-xl sm:text-2xl font-bold text-primary">
								{innerTitle}
							</h1>
						</div>
					) : (
						<Link
							to={gamePath}
							replace
							className="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<Logo
								className="w-5 h-5 sm:w-6 sm:h-6 text-primary"
								aria-label={
									syllables
										? "Logo Garbuix síl·labes"
										: mini
											? "Logo Garbuix mini"
											: "Logo Garbuix!"
								}
							/>
							<h1 className="text-2xl font-bold text-primary">
								{syllables ? (
									<>
										Garbuix{" "}
										<span className="text-[var(--syllable-star)]">
											síl·labes
										</span>
									</>
								) : mini ? (
									<>
										Garbuix{" "}
										<span className="text-[var(--mini-gold)]">mini</span>
									</>
								) : (
									"Garbuix!"
								)}
							</h1>
						</Link>
					)}
					{actionButtons(!innerTitle && !mini && !syllables)}
				</div>
			</div>
			{dialogs}
		</header>
	);
}
