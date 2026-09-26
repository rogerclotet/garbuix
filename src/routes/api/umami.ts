import { createFileRoute } from "@tanstack/react-router";
import { proxyUmamiRequest } from "@/lib/umami-server";

export const Route = createFileRoute("/api/umami")({
	server: {
		handlers: {
			POST: ({ request }) => proxyUmamiRequest(request),
		},
	},
});
