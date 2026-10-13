import { createFileRoute } from "@tanstack/react-router";
import { History } from "@/components/history/history";
import { withOfflineFallback } from "@/lib/offline-loader";
import { getHistoryPageData } from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/dies-anteriors")({
	loader: withOfflineFallback(() => getHistoryPageData()),
	component: HistoryPage,
});

function HistoryPage() {
	return <History initialData={Route.useLoaderData()} />;
}
