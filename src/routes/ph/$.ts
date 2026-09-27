import { createFileRoute } from "@tanstack/react-router";

// Old tabs may still have the SDK loaded. Never forward their events or config.
const retired = () =>
	new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/ph/$")({
	server: {
		handlers: {
			GET: retired,
			HEAD: retired,
			OPTIONS: retired,
			POST: retired,
		},
	},
});
