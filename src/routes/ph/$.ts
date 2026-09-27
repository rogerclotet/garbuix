import { createFileRoute } from "@tanstack/react-router";
import { proxyPostHogRequest } from "@/lib/posthog-proxy.server";

export const Route = createFileRoute("/ph/$")({
	server: {
		handlers: {
			GET: ({ request }) => proxyPostHogRequest(request),
			HEAD: ({ request }) => proxyPostHogRequest(request),
			OPTIONS: ({ request }) => proxyPostHogRequest(request),
			POST: ({ request }) => proxyPostHogRequest(request),
		},
	},
});
