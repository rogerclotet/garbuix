import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { PEER_CLUES_FLAG } from "@/lib/feature-flags";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import { ClueRequestsProvider } from "@/lib/use-clue-requests";
import { useFeatureFlag } from "@/lib/use-feature-flag";

const rootRoute = getRouteApi("__root__");

// Peer clue requests are logged-in only and gated behind the peer-clues flag.
// Anonymous players get the inert default context (no stream opened).
export function ClueRequestsRoot({ children }: PropsWithChildren) {
	const rootData = rootRoute.useLoaderData();
	const sessionUser = rootData.sessionUser;
	const peerCluesEnabled = useFeatureFlag(PEER_CLUES_FLAG);
	const [dateKey, setDateKey] = useState<string | null>(null);

	useEffect(() => {
		setDateKey(getTodayDateKey());
	}, []);

	return (
		<ClueRequestsProvider
			dateKey={dateKey}
			localUserId={sessionUser?.id ?? null}
			enabled={peerCluesEnabled && Boolean(sessionUser?.id)}
		>
			{children}
		</ClueRequestsProvider>
	);
}
