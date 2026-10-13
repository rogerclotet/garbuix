import { createFileRoute } from "@tanstack/react-router";
import { MiniHistory } from "@/components/mini/mini-history";
import { getMiniHistoryData } from "@/lib/mini-server-fns";
import { withOfflineFallback } from "@/lib/offline-loader";

export const Route = createFileRoute("/mini/dies-anteriors")({
	loader: withOfflineFallback(() => getMiniHistoryData()),
	head: () => ({ meta: [{ title: "Historial · Garbuix mini" }] }),
	component: MiniHistoryPage,
});

function MiniHistoryPage() {
	const data = Route.useLoaderData();
	return <MiniHistory key={data.userId} data={data} />;
}
