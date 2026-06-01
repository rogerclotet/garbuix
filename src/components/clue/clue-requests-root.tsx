import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import { ClueRequestsProvider } from "@/lib/use-clue-requests";

const rootRoute = getRouteApi("__root__");

// Peer clue requests are logged-in only. Anonymous players get the inert default
// context (no stream opened).
export function ClueRequestsRoot({ children }: PropsWithChildren) {
	const rootData = rootRoute.useLoaderData();
	const sessionUser = rootData.sessionUser;
	const [dateKey, setDateKey] = useState<string | null>(null);

	useEffect(() => {
		setDateKey(getTodayDateKey());
	}, []);

	return (
		<ClueRequestsProvider
			dateKey={dateKey}
			localUserId={sessionUser?.id ?? null}
			enabled={Boolean(sessionUser?.id)}
		>
			{children}
		</ClueRequestsProvider>
	);
}
