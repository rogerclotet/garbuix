import { createFileRoute } from "@tanstack/react-router";
import { getReadinessResponse } from "@/lib/readiness.server";

export const Route = createFileRoute("/api/ready")({
	server: {
		handlers: {
			GET: () => getReadinessResponse(),
			HEAD: async () => {
				const response = await getReadinessResponse();
				return new Response(null, {
					status: response.status,
					headers: response.headers,
				});
			},
		},
	},
});
