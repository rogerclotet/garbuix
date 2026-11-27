import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo, QuadratLogo } from "@/components/logo";
import { AlertDialogAction } from "@/components/ui/alert-dialog";
import { readMiniSaves } from "@/lib/mini-local";
import { hasPlayedPuzzle } from "@/lib/puzzle-progress";
import { getPlayedOtherGames } from "@/lib/puzzle-server-fns";
import { readQuadratSaves } from "@/lib/quadrat-local";
import { readSyllableSaves } from "@/lib/syllable-local";
import { GAME_PATHS } from "@/lib/use-rendered-route";

const OTHER_GAMES = [
	{ mode: "quadrat", readSaves: readQuadratSaves },
	{ mode: "mini", readSaves: readMiniSaves },
	{ mode: "syllables", readSaves: readSyllableSaves },
] as const;

type OtherGame = (typeof OTHER_GAMES)[number]["mode"];

const SECONDARY_GAMES = {
	mini: { label: "Mini", color: "var(--game-mini)" },
	syllables: { label: "Síl·labes", color: "var(--game-syllables)" },
};

export function WinGameRecommendations({
	dateKey,
	userId,
}: {
	dateKey: string;
	userId: string | null;
}) {
	const [games, setGames] = useState<OtherGame[]>([]);

	useEffect(() => {
		const locallyUnplayed = OTHER_GAMES.filter(
			({ readSaves }) =>
				!hasPlayedPuzzle(readSaves(null)[dateKey]) &&
				(!userId || !hasPlayedPuzzle(readSaves(userId)[dateKey])),
		).map(({ mode }) => mode);
		if (!userId || locallyUnplayed.length === 0) {
			setGames(locallyUnplayed);
			return;
		}

		let cancelled = false;
		void getPlayedOtherGames({ data: { dateKey } }).then(
			(result) => {
				if (!cancelled && result?.userId === userId) {
					setGames(locallyUnplayed.filter((mode) => !result.played[mode]));
				}
			},
			// Account progress is unknown offline or when the lookup fails.
			() => {},
		);
		return () => {
			cancelled = true;
		};
	}, [dateKey, userId]);

	if (games.length === 0) return null;

	return (
		<nav aria-label="Altres jocs" className="flex flex-wrap gap-2">
			<h3 className="w-full text-sm font-semibold">
				Et ve de gust un altre repte?
			</h3>
			{games.map((game) =>
				game === "quadrat" ? (
					<AlertDialogAction
						key={game}
						asChild
						className="w-full min-h-14 justify-start gap-3 px-3 text-left [--primary-foreground:#ffffff] [--primary:var(--game-quadrat)] dark:[--primary-foreground:#0d2a52]"
					>
						<Link to={GAME_PATHS[game]}>
							<QuadratLogo className="size-6" aria-hidden />
							<span className="min-w-0 flex-1 whitespace-normal">
								<span className="block font-semibold">Garbuix quadrat</span>
								<span className="block text-xs font-ui">
									Troba 15 paraules en una graella de 4×4.
								</span>
							</span>
							<ArrowRight className="size-4" aria-hidden />
						</Link>
					</AlertDialogAction>
				) : (
					<AlertDialogAction
						key={game}
						asChild
						variant="outline"
						className="min-h-10 flex-1"
					>
						<Link to={GAME_PATHS[game]}>
							<Logo
								className="size-4"
								style={{ color: SECONDARY_GAMES[game].color }}
								aria-hidden
							/>
							{SECONDARY_GAMES[game].label}
						</Link>
					</AlertDialogAction>
				),
			)}
		</nav>
	);
}
