import { authClient } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/puzzle-types";

export function useActiveSessionUser(fallbackUser: SessionUser) {
	const session = authClient.useSession();

	return {
		activeUser: session.isPending ? fallbackUser : (session.data?.user ?? null),
		session,
	};
}
