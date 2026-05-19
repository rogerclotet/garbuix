import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { getOrCreateAnonIdentity } from "@/lib/anon-identity";
import { anonParticipantId, userParticipantId } from "@/lib/leaderboard-types";
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

	useEffect(() => {
		setDateKey(getTodayDateKey());
		if (sessionUser?.id) {
			setLocalParticipantId(userParticipantId(sessionUser.id));
			return;
		}
		const identity = getOrCreateAnonIdentity();
		setLocalParticipantId(anonParticipantId(identity.deviceId));
	}, [sessionUser?.id]);

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
