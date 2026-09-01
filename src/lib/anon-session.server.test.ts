import { beforeAll, describe, expect, it } from "vitest";
import {
	mintAnonDeviceId,
	readAnonDeviceId,
	resolveAnonSession,
	serializeAnonCookie,
} from "@/lib/anon-session.server";

beforeAll(() => {
	// The signing key is derived from the auth secret; outside production the
	// schema supplies the dev fallback, so nothing needs to be set here.
	process.env.NODE_ENV = "test";
});

function requestWithCookie(cookie: string): Request {
	return new Request(
		"https://garbuix.app/api/clue-requests/2026-09-01/stream",
		{
			headers: { cookie },
		},
	);
}

function cookieValue(setCookie: string): string {
	return setCookie.split(";")[0];
}

describe("anon-session", () => {
	it("round trips a minted device id through a signed cookie", () => {
		const deviceId = mintAnonDeviceId();
		const request = requestWithCookie(
			cookieValue(serializeAnonCookie(deviceId)),
		);

		expect(readAnonDeviceId(request)).toBe(deviceId);
	});

	it("rejects an unsigned device id", () => {
		const deviceId = mintAnonDeviceId();

		expect(
			readAnonDeviceId(requestWithCookie(`garbuix_guest=${deviceId}`)),
		).toBeNull();
	});

	it("rejects a device id carrying someone else's signature", () => {
		const victim = mintAnonDeviceId();
		const attacker = mintAnonDeviceId();
		const victimSignature = cookieValue(serializeAnonCookie(victim)).split(
			".",
		)[1];

		// The whole point: knowing a victim's id is not enough to act as them.
		expect(
			readAnonDeviceId(
				requestWithCookie(`garbuix_guest=${attacker}.${victimSignature}`),
			),
		).toBeNull();
	});

	it("rejects a tampered signature", () => {
		const deviceId = mintAnonDeviceId();
		const signed = cookieValue(serializeAnonCookie(deviceId));

		expect(readAnonDeviceId(requestWithCookie(`${signed}tampered`))).toBeNull();
	});

	it("ignores a malformed or missing cookie", () => {
		expect(readAnonDeviceId(requestWithCookie("garbuix_guest="))).toBeNull();
		expect(
			readAnonDeviceId(requestWithCookie("garbuix_guest=nodot")),
		).toBeNull();
		expect(readAnonDeviceId(requestWithCookie("other=value"))).toBeNull();
		expect(
			readAnonDeviceId(new Request("https://garbuix.app/api/x")),
		).toBeNull();
	});

	it("keeps the cookie out of reach of scripts and cross-site requests", () => {
		const setCookie = serializeAnonCookie(mintAnonDeviceId());

		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("SameSite=Lax");
		expect(setCookie).toContain("Path=/");
	});

	it("mints an identity for a guest who has none, and keeps it afterwards", () => {
		const first = resolveAnonSession(new Request("https://garbuix.app/api/x"));
		expect(first.setCookie).not.toBeNull();

		const second = resolveAnonSession(
			requestWithCookie(cookieValue(first.setCookie as string)),
		);
		expect(second.deviceId).toBe(first.deviceId);
		// Already established, so nothing to re-issue.
		expect(second.setCookie).toBeNull();
	});

	it("gives every guest a distinct identity", () => {
		const ids = new Set(Array.from({ length: 50 }, () => mintAnonDeviceId()));

		expect(ids.size).toBe(50);
	});
});
