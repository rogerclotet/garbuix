import { getRouteApi } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useState } from "react";
import { getOrCreateAnonIdentity } from "@/lib/anon-identity";
import { anonParticipantId } from "@/lib/leaderboard-types";
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
		if (sessionUser?.id) {
			setAnonCredentials(null);
			return;
		}
		const identity = getOrCreateAnonIdentity();
		setAnonCredentials({ deviceId: identity.deviceId });
	}, [sessionUser?.id]);

	const localUserId =
		sessionUser?.id ??
		(anonCredentials ? anonParticipantId(anonCredentials.deviceId) : null);

	return (
		<ClueRequestsProvider
			dateKey={dateKey}
			localUserId={localUserId}
			anonCredentials={sessionUser?.id ? null : anonCredentials}
			enabled={localUserId != null}
		>
			{children}
		</ClueRequestsProvider>
	);
}
