import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";
import { observeServerAction } from "@/lib/observability-server";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				observeServerAction("auth_handler_get", () => auth.handler(request), {
					properties: {
						method: request.method,
						pathname: new URL(request.url).pathname,
					},
				}),
			POST: async ({ request }) =>
				observeServerAction("auth_handler_post", () => auth.handler(request), {
					properties: {
						method: request.method,
						pathname: new URL(request.url).pathname,
					},
				}),
		},
	},
});
