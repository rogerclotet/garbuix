import { createFileRoute } from "@tanstack/react-router";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { Quadrat } from "@/components/quadrat/quadrat";
import { withOfflineFallback } from "@/lib/offline-loader";
import { getQuadratPageData } from "@/lib/quadrat-server-fns";

export const Route = createFileRoute("/quadrat/")({
	loader: withOfflineFallback(() => getQuadratPageData()),
	pendingComponent: PuzzleLoadingPage,
	head: () => ({ meta: [{ title: "Garbuix quadrat" }] }),
	component: QuadratPage,
});

function QuadratPage() {
	const data = Route.useLoaderData();
	return (
		<Quadrat key={`${data.puzzle.id}:${data.userId}`} initialData={data} />
	);
}
