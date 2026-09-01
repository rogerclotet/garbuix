// The app served no security headers at all. It renders text other players
// wrote (peer clues) and proxies a third-party analytics script through its own
// origin, so it is worth constraining what a page may load and who may frame it.
//
// Applied in two places, because neither covers everything: Nitro route rules
// (see vite.config.ts) reach static assets from public/, and the Start request
// middleware (see src/start.ts) reaches SSR documents, server functions and the
// API routes. Nothing in server/plugins/ is picked up by this build, so a
// response hook there would be silently dead.

const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	// 'unsafe-inline' is required: the SSR document carries inline hydration
	// scripts, and per-request nonces would mean threading one through the
	// renderer. The policy still pins where external scripts may be loaded from,
	// which is what blocks an injected <script src>. Analytics needs no entry —
	// it is proxied through /ph on this origin.
	"script-src 'self' 'unsafe-inline'",
	// React sets inline styles through the style attribute across the board and
	// the keypad, which style-src governs.
	"style-src 'self' 'unsafe-inline'",
	// https: covers Google account avatars; fonts are bundled, not fetched.
	"img-src 'self' data: https:",
	"font-src 'self' data:",
	// Same-origin only: page loads, server functions, both SSE streams and the
	// analytics proxy all live here.
	"connect-src 'self'",
	"manifest-src 'self'",
	"worker-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	"upgrade-insecure-requests",
].join("; ");

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
): Record<string, string> {
	return {
		"Content-Security-Policy": CONTENT_SECURITY_POLICY,
		"X-Content-Type-Options": "nosniff",
		// Companion to frame-ancestors for browsers predating CSP level 2.
		"X-Frame-Options": "DENY",
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"Permissions-Policy": PERMISSIONS_POLICY,
		// Only meaningful over HTTPS, and dev serves plain HTTP on localhost.
		...(isProduction
			? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
			: {}),
	};
}
