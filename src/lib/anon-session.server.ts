import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/server-env";

// Identity for players with no account. The device id used to come straight
// from the client — a localStorage value sent in a request body or, for the
// SSE streams, a query parameter. That made it a claim rather than a
// credential: anyone could post leaderboard progress as another device, read a
// stranger's clue inbox by naming their id, and mint unlimited identities; the
// id also ended up in access logs and Referer headers by riding in the URL.
//
// The server now mints the id and returns it in a signed, HttpOnly cookie. The
// id itself stays public — it is the leaderboard participant id, broadcast to
// every viewer — but only a correctly signed cookie proves ownership of it, and
// the signature never reaches JavaScript or a URL.

const ANON_COOKIE_NAME = "garbuix_guest";
// Long-lived so a guest keeps their streak position across sessions; the data
// it identifies (leaderboard, clue inbox) expires far sooner on its own.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const DEVICE_ID_BYTES = 16;

function getSigningKey(): string {
	// Namespaced so a guest cookie can never be confused with an auth token
	// signed by the same secret.
	return `${getServerEnv().BETTER_AUTH_SECRET}:anon-device`;
}

function sign(deviceId: string): string {
	return createHmac("sha256", getSigningKey())
		.update(deviceId)
		.digest("base64url");
}

function isValidSignature(deviceId: string, signature: string): boolean {
	const expected = Buffer.from(sign(deviceId));
	const received = Buffer.from(signature);

	// timingSafeEqual throws on a length mismatch, which is itself a mismatch.
	if (expected.length !== received.length) {
		return false;
	}

	return timingSafeEqual(expected, received);
}

export function mintAnonDeviceId(): string {
	return randomBytes(DEVICE_ID_BYTES).toString("hex");
}

export function serializeAnonCookie(deviceId: string): string {
	const parts = [
		`${ANON_COOKIE_NAME}=${deviceId}.${sign(deviceId)}`,
		"Path=/",
		`Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
		"HttpOnly",
		// Lax rather than Strict: the game is linked to from shared results, and a
		// guest arriving that way should keep their board position.
		"SameSite=Lax",
	];

	// Dev serves plain HTTP on localhost, where a Secure cookie is dropped.
	if (process.env.NODE_ENV === "production") {
		parts.push("Secure");
	}

	return parts.join("; ");
}

function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get("cookie");
	if (!header) {
		return null;
	}

	for (const pair of header.split(";")) {
		const separatorIndex = pair.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}
		if (pair.slice(0, separatorIndex).trim() === name) {
			return pair.slice(separatorIndex + 1).trim();
		}
	}

	return null;
}

// Returns the device id only when the cookie carries a signature this server
// produced. An unsigned, tampered, or absent cookie yields null.
export function readAnonDeviceId(request: Request): string | null {
	const raw = readCookie(request, ANON_COOKIE_NAME);
	if (!raw) {
		return null;
	}

	const separatorIndex = raw.lastIndexOf(".");
	if (separatorIndex <= 0) {
		return null;
	}

	const deviceId = raw.slice(0, separatorIndex);
	const signature = raw.slice(separatorIndex + 1);
	if (!deviceId || !signature || !isValidSignature(deviceId, signature)) {
		return null;
	}

	return deviceId;
}

export type AnonSession = {
	deviceId: string;
	// Present only when this request minted a new identity, in which case the
	// caller must put it on the response as a Set-Cookie header.
	setCookie: string | null;
};

// Resolves the guest making this request, minting an identity when they don't
// have one yet. Minting on any anon-capable endpoint (including the SSE GETs)
// avoids a bootstrap round trip: the first request establishes the identity and
// every later one carries it.
export function resolveAnonSession(request: Request): AnonSession {
	const existing = readAnonDeviceId(request);
	if (existing) {
		return { deviceId: existing, setCookie: null };
	}

	const deviceId = mintAnonDeviceId();
	return { deviceId, setCookie: serializeAnonCookie(deviceId) };
}

export function withAnonCookie(
	response: Response,
	setCookie: string | null,
): Response {
	if (setCookie) {
		response.headers.append("Set-Cookie", setCookie);
	}

	return response;
}
