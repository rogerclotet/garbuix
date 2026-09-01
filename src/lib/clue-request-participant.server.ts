import { eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import { resolveAnonSession } from "@/lib/anon-session.server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { anonParticipantId } from "@/lib/leaderboard-types";
import {
	normalizeDisplayNameInput,
	resolveDisplayName,
} from "@/lib/user-profile";

export type ClueRequestParticipant = {
	id: string;
	name: string;
	kind: "user" | "anon";
	// Set only when this request minted a guest identity; the route must return
	// it as a Set-Cookie header so the next request carries the same id.
	setCookie?: string | null;
};

function resolveAnonName(rawName: string | null | undefined): string {
	if (!rawName) {
		return "Convidat";
	}
	return normalizeDisplayNameInput(rawName) ?? "Convidat";
}

// Resolves the player making a clue-request API call. Google sessions win when
// present; otherwise the signed guest cookie identifies anonymous players (same
// scheme as the anon leaderboard).
//
// The device id used to be read from the request body or the query string,
// which meant naming a stranger's id was enough to subscribe to their private
// clue-response channel. It now comes only from a cookie this server signed;
// `setCookie` is non-null when this request minted one, and the caller must put
// it on the response.
export async function resolveClueRequestParticipant(
	request: Request,
	body?: { name?: string },
): Promise<ClueRequestParticipant | null> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (session?.user?.id) {
		const profiles = await db
			.select({
				name: user.name,
				displayName: user.displayName,
			})
			.from(user)
			.where(eq(user.id, session.user.id))
			.limit(1);
		const profile = profiles[0];
		return {
			id: session.user.id,
			name: profile
				? resolveDisplayName(profile)
				: (session.user.name ?? "Algú"),
			kind: "user",
		};
	}

	const anonSession = resolveAnonSession(request);
	const url = new URL(request.url);
	const rawName = body?.name ?? url.searchParams.get("name");

	return {
		id: anonParticipantId(anonSession.deviceId),
		name: resolveAnonName(rawName),
		kind: "anon",
		setCookie: anonSession.setCookie,
	};
}
