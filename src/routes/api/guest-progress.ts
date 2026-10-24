import { createFileRoute } from "@tanstack/react-router";
import { handleGuestProgressReport } from "@/lib/guest-progress-report.server";

export const Route = createFileRoute("/api/guest-progress")({
	server: {
		handlers: {
			POST: ({ request }) => handleGuestProgressReport(request),
		},
	},
});
