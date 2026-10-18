import { createFileRoute } from "@tanstack/react-router";
import { QuadratHistory } from "@/components/quadrat/quadrat-history";
import { withOfflineFallback } from "@/lib/offline-loader";
import { getQuadratHistoryData } from "@/lib/quadrat-server-fns";

export const Route = createFileRoute("/quadrat/dies-anteriors")({
	loader: withOfflineFallback(() => getQuadratHistoryData()),
	head: () => ({ meta: [{ title: "Historial · Garbuix quadrat" }] }),
	component: QuadratHistoryPage,
});

function QuadratHistoryPage() {
	const data = Route.useLoaderData();
	return <QuadratHistory key={data.userId} data={data} />;
}
