import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { useAnonParticipantId } from "@/lib/anon-participant-store";
import { userParticipantId } from "@/lib/leaderboard-types";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import { LeaderboardProvider } from "@/lib/use-leaderboard";

const rootRoute = getRouteApi("__root__");

export function LeaderboardRoot({ children }: PropsWithChildren) {
	const rootData = rootRoute.useLoaderData();
	const sessionUser = rootData.sessionUser;
	const [dateKey, setDateKey] = useState<string | null>(null);
	const [localParticipantId, setLocalParticipantId] = useState<string | null>(
		null,
	);

	// A guest's participant id is minted by the server and learned from the
	// first response that carries it, so it can arrive after mount — before that
	// they have no row on the board to highlight.
	const anonParticipantId = useAnonParticipantId();

	useEffect(() => {
		setDateKey(getTodayDateKey());
		setLocalParticipantId(
			sessionUser?.id ? userParticipantId(sessionUser.id) : anonParticipantId,
		);
	}, [sessionUser?.id, anonParticipantId]);

	return (
		<LeaderboardProvider
			dateKey={dateKey}
			localParticipantId={localParticipantId}
			enabled={dateKey != null}
		>
			{children}
		</LeaderboardProvider>
	);
}
