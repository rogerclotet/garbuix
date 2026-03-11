import { createFileRoute } from "@tanstack/react-router";
import { History } from "@/components/history/history";
import { getHistoryPageData } from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/dies-anteriors")({
	loader: async () => getHistoryPageData(),
	component: HistoryPage,
});

function HistoryPage() {
	return <History initialData={Route.useLoaderData()} />;
}
