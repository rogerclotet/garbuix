// Constrain what a page may load and who may frame it. Peer clues contain
// text written by other players.
//
// Applied in two places, because neither covers everything: Nitro route rules
// (see vite.config.ts) reach static assets from public/, and the Start request
// middleware (see src/start.ts) reaches SSR documents, server functions and the
// API routes.

function getContentSecurityPolicy(browserDsn?: string): string {
	const reportingOrigin = browserDsn ? new URL(browserDsn) : undefined;
	if (
		reportingOrigin &&
		!["https:", "http:"].includes(reportingOrigin.protocol)
	) {
		throw new Error("VITE_SENTRY_DSN must use HTTP or HTTPS");
	}
	return [
		"default-src 'self'",
		// 'unsafe-inline' is required: the SSR document carries inline hydration
		// scripts, and per-request nonces would mean threading one through the
		// renderer. The policy still pins where external scripts may be loaded from,
		// which is what blocks an injected <script src>.
		"script-src 'self' 'unsafe-inline'",
		// React sets inline styles through the style attribute across the board and
		// the keypad, which style-src governs.
		"style-src 'self' 'unsafe-inline'",
		// https: covers Google account avatars; blob: the share image preview.
		// Fonts are bundled, not fetched.
		"img-src 'self' data: blob: https:",
		"font-src 'self' data:",
		// Allow only the configured reporting origin, never DSN credentials or paths.
		`connect-src 'self'${reportingOrigin ? ` ${reportingOrigin.origin}` : ""}`,
		"manifest-src 'self'",
		"worker-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"upgrade-insecure-requests",
	].join("; ");
}

const PERMISSIONS_POLICY = [
	"accelerometer=()",
	"camera=()",
	"geolocation=()",
	"gyroscope=()",
	"microphone=()",
	"payment=()",
	"usb=()",
].join(", ");

export function getSecurityHeaders(
	isProduction: boolean,
	browserDsn?: string,
): Record<string, string> {
	return {
		"Content-Security-Policy": getContentSecurityPolicy(browserDsn),
		"X-Content-Type-Options": "nosniff",
		// Companion to frame-ancestors for browsers predating CSP level 2.
		"X-Frame-Options": "DENY",
		"Referrer-Policy": "no-referrer",
		"Permissions-Policy": PERMISSIONS_POLICY,
		// Only meaningful over HTTPS, and dev serves plain HTTP on localhost.
		...(isProduction
			? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
			: {}),
	};
}
