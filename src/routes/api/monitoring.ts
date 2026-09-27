import { createFileRoute } from "@tanstack/react-router";
import { getErrorReporter } from "@/lib/error-tracking.server";
import { handleErrorReport } from "@/lib/error-tracking-request.server";

export const Route = createFileRoute("/api/monitoring")({
	server: {
		handlers: {
			POST: ({ request }) => {
				const reporter = getErrorReporter();
				return handleErrorReport(
					request,
					reporter ? (report) => reporter.send(report, "browser") : undefined,
				);
			},
		},
	},
});
