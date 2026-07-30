import { eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";
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
};

function resolveAnonName(rawName: string | null | undefined): string {
	if (!rawName) {
		return "Convidat";
	}
	return normalizeDisplayNameInput(rawName) ?? "Convidat";
}

function readDeviceId(
	request: Request,
	body?: { deviceId?: string },
): string | null {
	const url = new URL(request.url);
	const deviceId = body?.deviceId ?? url.searchParams.get("deviceId");
	if (!deviceId || deviceId.length > 128) {
		return null;
	}
	return deviceId;
}

// Resolves the player making a clue-request API call. Google sessions win when
// present; otherwise a stable browser device id identifies anonymous players
// (same scheme as the anon leaderboard).
export async function resolveClueRequestParticipant(
	request: Request,
	body?: { deviceId?: string; name?: string },
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

	const deviceId = readDeviceId(request, body);
	if (!deviceId) {
		return null;
	}

	const url = new URL(request.url);
	const rawName = body?.name ?? url.searchParams.get("name");

	return {
		id: anonParticipantId(deviceId),
		name: resolveAnonName(rawName),
		kind: "anon",
	};
}
