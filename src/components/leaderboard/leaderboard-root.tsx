import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { useAnonParticipantId } from "@/lib/anon-participant-store";
import { userParticipantId } from "@/lib/leaderboard-types";
import { LeaderboardProvider } from "@/lib/use-leaderboard";
import { useMiniRoute } from "@/lib/use-mini-route";
import { useTodayDateKey } from "@/lib/use-today-date-key";

const rootRoute = getRouteApi("__root__");

export function LeaderboardRoot({ children }: PropsWithChildren) {
	const mini = useMiniRoute();
	const rootData = rootRoute.useLoaderData();
	const sessionUser = rootData.sessionUser;
	const dateKey = useTodayDateKey(rootData.dateKey);
	const [localParticipantId, setLocalParticipantId] = useState<string | null>(
		null,
	);

	// A guest's participant id is minted by the server and learned from the
	// first response that carries it, so it can arrive after mount — before that
	// they have no row on the board to highlight.
	const anonParticipantId = useAnonParticipantId();

	useEffect(() => {
		setLocalParticipantId(
			sessionUser?.id ? userParticipantId(sessionUser.id) : anonParticipantId,
		);
	}, [sessionUser?.id, anonParticipantId]);

	return (
		<LeaderboardProvider
			key={dateKey}
			dateKey={dateKey}
			localParticipantId={localParticipantId}
			enabled={dateKey != null && !mini}
		>
			{children}
		</LeaderboardProvider>
	);
}
