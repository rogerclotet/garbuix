import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	openProfilePreferencesTip,
	useProfilePreferencesTipOpen,
} from "@/components/profile-preferences-tip-store";
import { ANALYTICS_EVENT, GAME_MODE } from "@/lib/analytics-events";
import { authClient } from "@/lib/auth-client";
import {
	getSortedAnonymousHistoryEntries,
	hasSeenHowToPlay,
	hasSeenMiniAnnouncement,
	hasSeenProfilePreferencesTip,
	hasSeenWelcome,
	markMiniAnnouncementSeen,
	markProfilePreferencesTipSeen,
	markWelcomeSeen,
} from "@/lib/puzzle-local";
import type { PuzzleProgressState } from "@/lib/puzzle-types";
import { useObservability } from "@/lib/use-observability";
import type { DailySessionUser } from "./daily-types";
import { openHowToPlay, useHowToPlayOpen } from "./how-to-play-store";

export function useDailyOnboarding({
	activeUser,
	isPresentable,
	derivedProgress,
	sharePreviewOpen,
	winDialogOpen,
}: {
	activeUser: DailySessionUser;
	isPresentable: boolean;
	derivedProgress: PuzzleProgressState;
	sharePreviewOpen: boolean;
	winDialogOpen: boolean;
}) {
	const { captureEvent, captureException } = useObservability();
	const [welcomeOpen, setWelcomeOpen] = useState(false);
	const [miniAnnouncementOpen, setMiniAnnouncementOpen] = useState(false);
	const tutorialOpen = useHowToPlayOpen();
	const profilePreferencesTipOpen = useProfilePreferencesTipOpen();
	const firstVisitChecked = useRef(false);
	const openHowToPlayIfFirstVisit = useCallback(() => {
		if (hasSeenHowToPlay()) return;
		openHowToPlay();
		captureEvent(ANALYTICS_EVENT.HOW_TO_PLAY_SHOWN, {
			game_mode: GAME_MODE.CLASSIC,
			trigger: "first_visit",
		});
	}, [captureEvent]);

	const openProfilePreferencesTipIfNeeded = useCallback(() => {
		if (!hasSeenHowToPlay()) return false;
		if (hasSeenProfilePreferencesTip()) return false;
		markProfilePreferencesTipSeen();
		openProfilePreferencesTip();
		captureEvent(ANALYTICS_EVENT.PROFILE_PREFERENCES_TIP_SHOWN, {
			game_mode: GAME_MODE.CLASSIC,
			trigger: "return_visit",
		});
		return true;
	}, [captureEvent]);

	useEffect(() => {
		if (!isPresentable || firstVisitChecked.current) return;
		firstVisitChecked.current = true;

		if (!hasSeenHowToPlay()) {
			openHowToPlayIfFirstVisit();
			return;
		}

		const shouldShowWelcome = !activeUser && !hasSeenWelcome();
		if (shouldShowWelcome) {
			setWelcomeOpen(true);
			captureEvent(ANALYTICS_EVENT.WELCOME_SHOWN, {
				game_mode: GAME_MODE.CLASSIC,
				trigger: "first_visit",
			});
			return;
		}

		if (openProfilePreferencesTipIfNeeded()) return;

		// Decide only on arrival. Finishing onboarding must not queue another dialog.
		if (
			tutorialOpen ||
			profilePreferencesTipOpen ||
			welcomeOpen ||
			sharePreviewOpen ||
			winDialogOpen ||
			hasSeenMiniAnnouncement()
		)
			return;
		const hasLocalPlay =
			derivedProgress.guessCount > 0 ||
			derivedProgress.hintsUsed > 0 ||
			getSortedAnonymousHistoryEntries().some(
				(entry) =>
					entry.guessCount > 0 || entry.hintsUsed > 0 || entry.guessedWords > 0,
			);
		if (!activeUser && !hasLocalPlay) return;
		markMiniAnnouncementSeen();
		setMiniAnnouncementOpen(true);
	}, [
		activeUser,
		captureEvent,
		openHowToPlayIfFirstVisit,
		openProfilePreferencesTipIfNeeded,
		isPresentable,
		derivedProgress.guessCount,
		derivedProgress.hintsUsed,
		tutorialOpen,
		profilePreferencesTipOpen,
		welcomeOpen,
		sharePreviewOpen,
		winDialogOpen,
	]);

	const handleWelcomeOpenChange = useCallback(
		(next: boolean) => {
			setWelcomeOpen(next);
			if (next) return;
			markWelcomeSeen();
			if (!hasSeenHowToPlay()) {
				openHowToPlayIfFirstVisit();
				return;
			}
			openProfilePreferencesTipIfNeeded();
		},
		[openHowToPlayIfFirstVisit, openProfilePreferencesTipIfNeeded],
	);

	const handleWelcomeContinueAnonymous = useCallback(() => {
		captureEvent(ANALYTICS_EVENT.WELCOME_DISMISSED, {
			game_mode: GAME_MODE.CLASSIC,
			choice: "anonymous",
		});
	}, [captureEvent]);

	const signInWithGoogle = useCallback(
		async (source: string) => {
			captureEvent(ANALYTICS_EVENT.AUTH_SIGN_IN_STARTED, {
				game_mode: GAME_MODE.CLASSIC,
				provider: "google",
				source,
			});
			try {
				await authClient.signIn.social({
					provider: "google",
					callbackURL: window.location.href,
				});
			} catch (error) {
				captureException(error, { scope: `${source}_sign_in` });
				toast.error("No s'ha pogut iniciar la sessió");
			}
		},
		[captureEvent, captureException],
	);

	const handleWelcomeSignIn = useCallback(() => {
		captureEvent(ANALYTICS_EVENT.WELCOME_DISMISSED, {
			game_mode: GAME_MODE.CLASSIC,
			choice: "google",
		});
		markWelcomeSeen();
		setWelcomeOpen(false);
		void signInWithGoogle("welcome_dialog");
	}, [captureEvent, signInWithGoogle]);

	return {
		welcomeOpen,
		miniAnnouncementOpen,
		setMiniAnnouncementOpen,
		tutorialOpen,
		handleWelcomeOpenChange,
		handleWelcomeContinueAnonymous,
		handleWelcomeSignIn,
		signInWithGoogle,
	};
}
