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

export function useActiveSessionUser(fallbackUser: SessionUser) {
	const session = authClient.useSession();
	const authUser = session.data?.user;
	const cachedUserRef = useRef<SessionUser>(null);

	const activeUser = useMemo((): SessionUser => {
		let next: SessionUser;
		if (session.isPending) {
			next = fallbackUser;
		} else if (!authUser) {
			next = null;
		} else {
			next = mergeSessionUser(authUser, fallbackUser);
		}
		return retainSessionUserReference(next, cachedUserRef);
	}, [session.isPending, authUser, fallbackUser]);

	return {
		activeUser,
		activeUserId: activeUser?.id ?? null,
		session,
	};
}
