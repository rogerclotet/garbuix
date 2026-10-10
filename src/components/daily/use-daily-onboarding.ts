import { useCallback, useEffect, useRef, useState } from "react";
import {
	openProfilePreferencesTip,
	useProfilePreferencesTipOpen,
} from "@/components/profile-preferences-tip-store";
import { openSignIn } from "@/components/sign-in/sign-in-store";
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
	const [welcomeOpen, setWelcomeOpen] = useState(false);
	const [miniAnnouncementOpen, setMiniAnnouncementOpen] = useState(false);
	const tutorialOpen = useHowToPlayOpen();
	const profilePreferencesTipOpen = useProfilePreferencesTipOpen();
	const firstVisitChecked = useRef(false);
	const openHowToPlayIfFirstVisit = useCallback(() => {
		if (hasSeenHowToPlay()) return;
		openHowToPlay();
	}, []);

	const openProfilePreferencesTipIfNeeded = useCallback(() => {
		if (!hasSeenHowToPlay()) return false;
		if (hasSeenProfilePreferencesTip()) return false;
		markProfilePreferencesTipSeen();
		openProfilePreferencesTip();
		return true;
	}, []);

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

	const handleWelcomeSignIn = useCallback(() => {
		markWelcomeSeen();
		setWelcomeOpen(false);
		openSignIn();
	}, []);

	return {
		welcomeOpen,
		miniAnnouncementOpen,
		setMiniAnnouncementOpen,
		tutorialOpen,
		handleWelcomeOpenChange,
		handleWelcomeSignIn,
	};
}
