import { createPrivateKey, sign } from "node:crypto";

// Apple's "client secret" is an ES256 JWT signed with the team's .p8 key, and
// Apple rejects any that lives longer than six months. Rather than pasting a
// pre-generated token into the environment and rotating it by hand, the server
// signs its own and renews it well before it expires.
const SECRET_LIFETIME_SECONDS = 180 * 24 * 60 * 60;
const RENEW_BEFORE_SECONDS = 30 * 24 * 60 * 60;

export type AppleSigningConfig = {
	clientId: string;
	teamId: string;
	keyId: string;
	privateKey: string;
};

function base64url(value: string | Buffer): string {
	return Buffer.from(value).toString("base64url");
}

// Environment files usually hold the PEM on one line with literal "\n"s.
export function normalizeApplePrivateKey(raw: string): string {
	return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function signAppleClientSecret(
	config: AppleSigningConfig,
	nowSeconds = Math.floor(Date.now() / 1000),
): { token: string; expiresAt: number } {
	const expiresAt = nowSeconds + SECRET_LIFETIME_SECONDS;
	const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
	const payload = {
		iss: config.teamId,
		iat: nowSeconds,
		exp: expiresAt,
		aud: "https://appleid.apple.com",
		sub: config.clientId,
	};
	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
	const key = createPrivateKey(normalizeApplePrivateKey(config.privateKey));
	// JWS wants the raw r||s signature, not Node's default DER encoding.
	const signature = sign("sha256", Buffer.from(signingInput), {
		key,
		dsaEncoding: "ieee-p1363",
	});
	return { token: `${signingInput}.${base64url(signature)}`, expiresAt };
}

// Returns a getter for the current secret. Better Auth reads the provider's
// `clientSecret` each time it exchanges a code, so exposing it through a getter
// keeps a long-running server from ever sending an expired one.
export function createAppleClientSecretSource(
	config: AppleSigningConfig,
	now: () => number = () => Math.floor(Date.now() / 1000),
): () => string {
	let current = signAppleClientSecret(config, now());
	return () => {
		const nowSeconds = now();
		if (current.expiresAt - nowSeconds < RENEW_BEFORE_SECONDS) {
			current = signAppleClientSecret(config, nowSeconds);
		}
		return current.token;
	};
}
