import { createFileRoute } from "@tanstack/react-router";
import { Daily } from "@/components/daily/daily";
import {
	getDailyPuzzlePublic,
	getUserPuzzleProgress,
} from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/")({
	loader: async () => {
		const dailyData = await getDailyPuzzlePublic();
		const progress = dailyData.sessionUser
			? await getUserPuzzleProgress({
					data: { puzzleId: dailyData.puzzle.id },
				})
			: null;

		return {
			...dailyData,
			progress,
		};
	},
	component: IndexPage,
});

function IndexPage() {
	return <Daily initialData={Route.useLoaderData()} />;
}
