import { describe, expect, it } from "vitest";
import { getSecurityHeaders } from "./security-headers";

function connectSource(dsn?: string) {
	return getSecurityHeaders(true, dsn)
		["Content-Security-Policy"].split("; ")
		.find((directive) => directive.startsWith("connect-src "));
}

describe("error reporting CSP", () => {
	it("allows only same-origin connections when reporting is disabled", () => {
		expect(connectSource()).toBe("connect-src 'self'");
		expect(connectSource("")).toBe("connect-src 'self'");
	});

	it.each([
		["https://public@glitchtip.clotet.dev/1", "https://glitchtip.clotet.dev"],
		[
			"https://public@o123.ingest.de.sentry.io/456",
			"https://o123.ingest.de.sentry.io",
		],
		[
			"http://public:secret@localhost:8000/glitchtip/1",
			"http://localhost:8000",
		],
	])(
		"allows the DSN origin without exposing credentials or paths",
		(dsn, origin) => {
			expect(connectSource(dsn)).toBe(`connect-src 'self' ${origin}`);
		},
	);

	it.each(["not a URL", "javascript:alert(1)", "file:///tmp/events"])(
		"rejects an invalid reporting URL: %s",
		(dsn) => {
			expect(() => getSecurityHeaders(true, dsn)).toThrow();
		},
	);
});
