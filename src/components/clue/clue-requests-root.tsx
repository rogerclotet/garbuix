import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { useAnonParticipantId } from "@/lib/anon-participant-store";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import {
	type AnonClueCredentials,
	ClueRequestsProvider,
} from "@/lib/use-clue-requests";

const rootRoute = getRouteApi("__root__");

export function ClueRequestsRoot({ children }: PropsWithChildren) {
	const rootData = rootRoute.useLoaderData();
	const sessionUser = rootData.sessionUser;
	const [dateKey, setDateKey] = useState<string | null>(null);
	const [anonCredentials, setAnonCredentials] =
		useState<AnonClueCredentials | null>(null);

	useEffect(() => {
		setDateKey(getTodayDateKey());
	}, []);

	useEffect(() => {
		setAnonCredentials(sessionUser?.id ? null : { isGuest: true });
	}, [sessionUser?.id]);

	// Null for a guest until the server's first response reports the id it
	// minted for them; the provider opens the stream regardless, which is one of
	// the ways that id arrives.
	const anonParticipantId = useAnonParticipantId();
	const localUserId = sessionUser?.id ?? anonParticipantId;

	return (
		<ClueRequestsProvider
			dateKey={dateKey}
			localUserId={localUserId}
			anonCredentials={sessionUser?.id ? null : anonCredentials}
			enabled={dateKey != null}
		>
			{children}
		</ClueRequestsProvider>
	);
}
