import { pickAnonName } from "@/lib/anon-name";
import { normalizeDisplayNameInput } from "@/lib/user-profile";

export const EMAIL_CODE_SIGN_IN_PATH = "/sign-in/email-otp";

// Decides the name and photo a new account starts with. Google shares a name,
// which the account keeps. An emailed code shares none, so the player keeps the
// guest name they already play under, or gets a fresh one in the same style;
// they can change it in Preferències either way.
//
// On the emailed-code path the name and photo come straight from the request
// body, so the name is sanitized like any typed display name and the photo is
// dropped rather than let a client point the leaderboard at any URL.
export function resolveNewUserProfile(input: {
	name: string;
	image: string | null | undefined;
	path: string | undefined;
}): { name: string; image: string | null } {
	if (input.path === EMAIL_CODE_SIGN_IN_PATH) {
		return {
			name: normalizeDisplayNameInput(input.name) ?? pickAnonName(),
			image: null,
		};
	}

	return {
		name: input.name.trim() || pickAnonName(),
		image: input.image ?? null,
	};
}
