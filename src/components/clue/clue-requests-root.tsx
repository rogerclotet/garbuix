import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { useAnonParticipantId } from "@/lib/anon-participant-store";
import {
	type AnonClueCredentials,
	ClueRequestsProvider,
} from "@/lib/use-clue-requests";
import { useTodayDateKey } from "@/lib/use-today-date-key";

const rootRoute = getRouteApi("__root__");

export function ClueRequestsRoot({ children }: PropsWithChildren) {
	const rootData = rootRoute.useLoaderData();
	const sessionUser = rootData.sessionUser;
	const dateKey = useTodayDateKey(rootData.dateKey);
	const [anonCredentials, setAnonCredentials] =
		useState<AnonClueCredentials | null>(null);

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
			key={dateKey}
			dateKey={dateKey}
			localUserId={localUserId}
			anonCredentials={sessionUser?.id ? null : anonCredentials}
			enabled={dateKey != null}
		>
			{children}
		</ClueRequestsProvider>
	);
}
