import { createFileRoute } from "@tanstack/react-router";
import { MiniHistory } from "@/components/mini/mini-history";
import { getMiniHistoryData } from "@/lib/mini-server-fns";

export const Route = createFileRoute("/mini/dies-anteriors")({
	loader: () => getMiniHistoryData(),
	head: () => ({ meta: [{ title: "Historial · Garbuixmini" }] }),
	component: MiniHistoryPage,
});

function MiniHistoryPage() {
	const data = Route.useLoaderData();
	return <MiniHistory key={data.userId} data={data} />;
}
