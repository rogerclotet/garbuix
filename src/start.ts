import { createMiddleware, createStart } from "@tanstack/react-start";
import { getSecurityHeaders } from "@/lib/security-headers";

// Runs for every request Start handles — SSR documents, server functions and
// the API routes. Nitro route rules cover static assets but never reach these,
// so the headers are applied here too.
const securityHeadersMiddleware = createMiddleware({ type: "request" }).server(
	async ({ next }) => {
		const result = await next();
		const headers = getSecurityHeaders(process.env.NODE_ENV === "production");

		for (const [name, value] of Object.entries(headers)) {
			// Never override a header a handler set deliberately.
			if (!result.response.headers.has(name)) {
				result.response.headers.set(name, value);
			}
		}

		return result;
	},
);

export const startInstance = createStart(() => ({
	requestMiddleware: [securityHeadersMiddleware],
}));
