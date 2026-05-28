import { createFileRoute } from "@tanstack/react-router";
import {
	PistesReview,
	type PistesReviewData,
} from "@/components/admin/pistes-review";
import {
	getCluesForReview,
	getModelRatingSummary,
} from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/admin/pistes")({
	loader: async (): Promise<PistesReviewData> => {
		try {
			const [clues, summary] = await Promise.all([
				getCluesForReview({ data: {} }),
				getModelRatingSummary({ data: {} }),
			]);
			return { authorized: true, clues, summary };
		} catch (error) {
			// requireAdminSession throws for anonymous / non-admin users; any other
			// failure also degrades to the restricted view but is worth logging.
			console.error("[admin/pistes] failed to load clue review", error);
			return { authorized: false };
		}
	},
	component: PistesAdminPage,
});

function PistesAdminPage() {
	return <PistesReview initialData={Route.useLoaderData()} />;
}
