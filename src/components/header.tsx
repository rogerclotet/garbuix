import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { ChevronLeft, HelpingHand, Share2, Trophy } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useDailyHeaderSummary } from "@/components/daily/daily-header-store";
import { DailyProgressRing } from "@/components/daily/daily-progress-ring";
import { HowToPlayDialog } from "@/components/daily/how-to-play-dialog";
import {
	setHowToPlayOpen,
	useHowToPlayOpen,
} from "@/components/daily/how-to-play-store";
import { Logo } from "@/components/logo";
import { ProfilePreferencesTipDialog } from "@/components/profile-preferences-tip-dialog";
import {
	setProfilePreferencesTipOpen,
	useProfilePreferencesTipOpen,
} from "@/components/profile-preferences-tip-store";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { WORD_LIST_SECTION_ID, wordRowId } from "@/lib/clue-request-types";
import { useClueRequests } from "@/lib/use-clue-requests";
import { useFeatureFlag } from "@/lib/use-feature-flag";
import { cn } from "@/lib/utils";

// Keep in sync with the flag read in daily.tsx.
const REDESIGN_FLAG = "mobile-redesign";

const INNER_PAGE_TITLES: Record<string, string> = {
	"/classificacio": "Classificació",
	"/dies-anteriors": "Dies anteriors",
	"/preferencies": "Preferències",
};

export default function Header() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const historyIndex = useRouterState({
		select: (s) => s.location.state.__TSR_index,
	});
	const homeHistoryIndexRef = useRef<number | null>(null);

	useLayoutEffect(() => {
		if (pathname === "/" && typeof historyIndex === "number") {
			homeHistoryIndexRef.current = historyIndex;
		}
	}, [pathname, historyIndex]);

	const innerTitle = INNER_PAGE_TITLES[pathname];
	const howToPlayOpen = useHowToPlayOpen();
	const profilePreferencesTipOpen = useProfilePreferencesTipOpen();
	const dailySummary = useDailyHeaderSummary();
	const isRedesign = useFeatureFlag(REDESIGN_FLAG);
	// The redesigned header only takes over on the daily board, and only once the
	// game has published its progress — every other route keeps the usual row.
	const showDailyHeader = isRedesign && !innerTitle && dailySummary != null;
	// Inner pages get the same narrow app bar, but with a back arrow and the
	// section title standing in for the ring and try count.
	const showInnerRedesignHeader = isRedesign && !!innerTitle;
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

	const goHome = () => {
		const homeHistoryIndex = homeHistoryIndexRef.current;

		// Rewind to the last game entry, dropping every inner page visited since.
		if (
			typeof homeHistoryIndex === "number" &&
			typeof historyIndex === "number" &&
			historyIndex > homeHistoryIndex
		) {
			router.history.go(homeHistoryIndex - historyIndex);
			return;
		}

		void navigate({ to: "/", replace: true });
	};

	// Share / trophy / help badge / avatar, shared by all header layouts. Both
	// designs carry the share action the progress meters used to own; the
	// redesigned row has a ring and two lines of text to fit, so its buttons are
	// a size smaller again. Inner pages (classificació, dies anteriors,
	// preferències) drop the share and ranking actions entirely.
	const actionButtons = (compact: boolean, showNav: boolean) => (
		<div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
			{showNav && dailySummary ? (
				<Button
					variant="ghost"
					size="icon"
					onClick={dailySummary.onShare}
					className={cn(
						"rounded-full hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20",
						compact
							? "size-9 text-muted-foreground"
							: "size-10 text-foreground sm:size-9",
					)}
					aria-label="Compartir progrés"
				>
					<Share2 className={compact ? "size-[18px]" : "size-5"} />
				</Button>
			) : null}
			{showNav && pathname !== "/classificacio" ? (
				<Button
					variant="ghost"
					size="icon"
					asChild
					className={cn(
						"rounded-full hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20",
						compact
							? "size-9 text-muted-foreground"
							: "size-10 text-foreground sm:size-9",
					)}
				>
					<Link to="/classificacio" aria-label="Classificació">
						<Trophy className={compact ? "size-[18px]" : "size-5"} />
					</Link>
				</Button>
			) : null}
			{helpRequestCount > 0 ? (
				<Button
					variant="ghost"
					size="icon"
					onClick={goToWordList}
					className={cn(
						"relative rounded-full text-foreground hover:bg-muted",
						compact ? "size-9" : "size-10 sm:size-9",
					)}
					aria-label={`${helpRequestCount} ${
						helpRequestCount === 1
							? "jugador demana ajuda"
							: "jugadors demanen ajuda"
					}`}
				>
					<HelpingHand className={compact ? "size-[18px]" : "size-5"} />
					<span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground tabular-nums">
						{helpRequestCount > 9 ? "9+" : helpRequestCount}
					</span>
				</Button>
			) : null}
			<UserMenu />
		</div>
	);

	const dialogs = (
		<>
			<HowToPlayDialog open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />
			<ProfilePreferencesTipDialog
				open={profilePreferencesTipOpen}
				onOpenChange={setProfilePreferencesTipOpen}
			/>
		</>
	);

	// Redesigned board: the progress ring and the counters move into the app
	// chrome, so the board owns everything below the header.
	if (showDailyHeader && dailySummary) {
		const remaining = dailySummary.total - dailySummary.found;
		// A finished puzzle can't earn more extra words, so the inner ring and its
		// counter drop out rather than sitting there frozen.
		const showBonus = dailySummary.showBonus && remaining > 0;

		return (
			<header className="bg-background transition-colors duration-300">
				<div className="mx-auto flex max-w-2xl items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.625rem)] pb-2 sm:px-4">
					<DailyProgressRing
						found={dailySummary.found}
						total={dailySummary.total}
						bonusInCycle={dailySummary.bonusInCycle}
						bonusTarget={dailySummary.bonusTarget}
						showBonus={showBonus}
						pulse={dailySummary.justEarnedBonus}
					/>
					<div className="min-w-0 flex-1">
						<Link
							to="/"
							className="block truncate text-[15px] font-bold tracking-tight text-primary transition-opacity hover:opacity-80"
						>
							Garbuix!
						</Link>
						<p className="truncate text-xs font-medium text-muted-foreground font-ui">
							{remaining === 0
								? "Completat"
								: `${dailySummary.guessCount} ${
										dailySummary.guessCount === 1 ? "intent" : "intents"
									}`}
							{showBonus ? (
								<>
									<span className="text-muted-foreground/50"> · </span>
									<span className="font-semibold text-game-extra-strong">
										{dailySummary.justEarnedBonus
											? "pista desbloquejada!"
											: `${dailySummary.bonusInCycle}/${dailySummary.bonusTarget} extres`}
									</span>
								</>
							) : null}
						</p>
					</div>
					{actionButtons(true, true)}
				</div>
				{dialogs}
			</header>
		);
	}

	// Inner pages: same narrow app bar as the daily board, but the ring becomes
	// a back arrow and the try count becomes the section title.
	if (showInnerRedesignHeader) {
		return (
			<header className="bg-background transition-colors duration-300">
				<div className="mx-auto flex max-w-2xl items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.625rem)] pb-2 sm:px-4">
					<Button
						variant="ghost"
						size="icon"
						onClick={goHome}
						className="size-9 -ml-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Tornar"
					>
						<ChevronLeft className="size-5" />
					</Button>
					<div className="min-w-0 flex-1">
						<Link
							to="/"
							className="block truncate text-[15px] font-bold tracking-tight text-primary transition-opacity hover:opacity-80"
						>
							Garbuix!
						</Link>
						<p className="truncate text-xs font-medium text-muted-foreground font-ui">
							{innerTitle}
						</p>
					</div>
					{actionButtons(true, false)}
				</div>
				{dialogs}
			</header>
		);
	}

	return (
		<header className="bg-background transition-colors duration-300">
			<div className="max-w-5xl mx-auto px-3 sm:px-4 pb-1 sm:pb-1.5 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				<div className="flex items-center justify-between gap-2">
					{innerTitle ? (
						<div className="flex min-w-0 items-center gap-1 sm:gap-2">
							<Button
								variant="ghost"
								size="icon-lg"
								onClick={goHome}
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
							to="/"
							className="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<Logo className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
							<h1 className="text-xl sm:text-2xl font-bold text-primary">
								Garbuix!
							</h1>
						</Link>
					)}
					{actionButtons(false, true)}
				</div>
			</div>
			{dialogs}
		</header>
	);
}
