// Every way a player can sign in, in the order the sign-in dialog lists them.
// Each one is only offered when the server has the credentials it needs.
export const SIGN_IN_METHODS = ["google", "apple", "reddit", "email"] as const;

export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

export type SocialSignInMethod = Exclude<SignInMethod, "email">;

export const SOCIAL_SIGN_IN_LABELS: Record<SocialSignInMethod, string> = {
	google: "Google",
	apple: "Apple",
	reddit: "Reddit",
};

// Reddit shares no email address, so Better Auth files those accounts under a
// made-up one on this reserved domain. It means nothing to the player.
export function isPlaceholderEmail(email: string): boolean {
	return email.toLowerCase().endsWith(".placeholder.invalid");
}
