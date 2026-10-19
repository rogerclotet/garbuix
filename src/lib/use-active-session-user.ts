import { useMemo, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/puzzle-types";
import { resolveAvatarImage, resolveDisplayName } from "@/lib/user-profile";

function mergeSessionUser(
	authUser: {
		id: string;
		name: string;
		email: string;
		image?: string | null;
	},
	fallbackUser: SessionUser,
): SessionUser {
	if (fallbackUser?.id === authUser.id) {
		const profile = {
			name: authUser.name,
			displayName: fallbackUser.displayName ?? null,
			image: authUser.image ?? null,
			useGoogleAvatar: fallbackUser.useGoogleAvatar ?? true,
		};
		return {
			id: authUser.id,
			name: resolveDisplayName(profile),
			displayName: fallbackUser.displayName ?? null,
			email: authUser.email,
			image: resolveAvatarImage(profile),
			googleImage: authUser.image ?? null,
			useGoogleAvatar: fallbackUser.useGoogleAvatar ?? true,
		};
	}

	const profile = {
		name: authUser.name,
		displayName: null,
		image: authUser.image ?? null,
		useGoogleAvatar: true,
	};
	return {
		id: authUser.id,
		name: resolveDisplayName(profile),
		displayName: null,
		email: authUser.email,
		image: resolveAvatarImage(profile),
		googleImage: authUser.image ?? null,
		useGoogleAvatar: true,
	};
}

function isSameSessionUser(left: SessionUser, right: SessionUser): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return left === right;
	}
	return (
		left.id === right.id &&
		left.name === right.name &&
		left.displayName === right.displayName &&
		left.email === right.email &&
		left.image === right.image &&
		left.googleImage === right.googleImage &&
		left.useGoogleAvatar === right.useGoogleAvatar
	);
}

function retainSessionUserReference(
	next: SessionUser,
	cacheRef: { current: SessionUser },
): SessionUser {
	if (isSameSessionUser(cacheRef.current, next)) {
		return cacheRef.current;
	}
	cacheRef.current = next;
	return next;
}

// better-auth keeps the last session it read when a refetch fails, and only
// clears it on a 401. A first read that fails some other way, most often one
// made offline from a page the service worker cached, never reached a server
// that could say who is signed in. Treating that as signed out would move a
// signed-in player onto guest progress, so it counts as still pending.
function hasUnansweredSessionRead(error: unknown) {
	if (!error) return false;
	return (error as { status?: unknown }).status !== 401;
}

export function useActiveSessionUser(fallbackUser: SessionUser) {
	const session = authClient.useSession();
	const authUser = session.data?.user;
	const cachedUserRef = useRef<SessionUser>(null);
	const sessionUnknown =
		session.isPending || (!authUser && hasUnansweredSessionRead(session.error));

	const activeUser = useMemo((): SessionUser => {
		let next: SessionUser;
		if (sessionUnknown) {
			next = fallbackUser;
		} else if (!authUser) {
			next = null;
		} else {
			next = mergeSessionUser(authUser, fallbackUser);
		}
		return retainSessionUserReference(next, cachedUserRef);
	}, [sessionUnknown, authUser, fallbackUser]);

	return {
		activeUser,
		activeUserId: activeUser?.id ?? null,
		// False while activeUser is still the rendered fallback, which can name
		// an account whose session has since ended: a page the service worker
		// cached, or loader data kept from earlier in this document.
		sessionConfirmed: !sessionUnknown,
		session,
	};
}
