import { createFileRoute } from "@tanstack/react-router";
import { proxyGlitchTipRequest } from "@/lib/glitchtip-tunnel.server";
import { getServerEnv } from "@/lib/server-env";

export const Route = createFileRoute("/api/monitoring")({
	server: {
		handlers: {
			POST: ({ request }) =>
				proxyGlitchTipRequest(request, getServerEnv().GLITCHTIP_DSN),
		},
	},
});
