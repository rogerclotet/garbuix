// Every way a player can sign in, in the order the sign-in dialog lists them.
// Each one is only offered when the server has the credentials it needs.
export const SIGN_IN_METHODS = ["google", "email"] as const;

export type SignInMethod = (typeof SIGN_IN_METHODS)[number];
