import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	createAppleClientSecretSource,
	normalizeApplePrivateKey,
	signAppleClientSecret,
} from "@/lib/apple-client-secret.server";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
	namedCurve: "P-256",
});
const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

const config = {
	clientId: "app.garbuix.web",
	teamId: "TEAM123456",
	keyId: "KEY1234567",
	privateKey: pem,
};

function decodeSegment(segment: string) {
	return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("signAppleClientSecret", () => {
	it("signs an ES256 JWT with the claims Apple expects", () => {
		const now = 1_800_000_000;
		const { token, expiresAt } = signAppleClientSecret(config, now);
		const [header, payload, signature] = token.split(".");

		expect(decodeSegment(header ?? "")).toEqual({
			alg: "ES256",
			kid: "KEY1234567",
			typ: "JWT",
		});
		expect(decodeSegment(payload ?? "")).toEqual({
			iss: "TEAM123456",
			iat: now,
			exp: expiresAt,
			aud: "https://appleid.apple.com",
			sub: "app.garbuix.web",
		});
		// Apple caps the lifetime at six months.
		expect(expiresAt - now).toBeLessThanOrEqual(183 * 24 * 60 * 60);
		expect(
			verify(
				"sha256",
				Buffer.from(`${header}.${payload}`),
				{ key: publicKey, dsaEncoding: "ieee-p1363" },
				Buffer.from(signature ?? "", "base64url"),
			),
		).toBe(true);
	});

	it("accepts a key stored on one line with escaped newlines", () => {
		const oneLine = pem.trim().replace(/\n/g, "\\n");

		expect(normalizeApplePrivateKey(oneLine)).toBe(pem.trim());
		expect(() =>
			signAppleClientSecret({ ...config, privateKey: oneLine }),
		).not.toThrow();
	});
});

describe("createAppleClientSecretSource", () => {
	it("reuses the secret and renews it before it expires", () => {
		let now = 1_800_000_000;
		const getSecret = createAppleClientSecretSource(config, () => now);
		const first = getSecret();

		now += 100 * 24 * 60 * 60;
		expect(getSecret()).toBe(first);

		now += 60 * 24 * 60 * 60;
		const renewed = getSecret();
		expect(renewed).not.toBe(first);
		expect(decodeSegment(renewed.split(".")[1] ?? "").iat).toBe(now);
	});
});
