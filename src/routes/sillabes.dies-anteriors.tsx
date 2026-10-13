import { createFileRoute } from "@tanstack/react-router";
import { SyllableHistory } from "@/components/syllables/syllable-history";
import { withOfflineFallback } from "@/lib/offline-loader";
import { getSyllableHistoryData } from "@/lib/syllable-server-fns";

export const Route = createFileRoute("/sillabes/dies-anteriors")({
	loader: withOfflineFallback(() => getSyllableHistoryData()),
	head: () => ({ meta: [{ title: "Historial · Garbuix síl·labes" }] }),
	component: SyllableHistoryPage,
});

function SyllableHistoryPage() {
	const data = Route.useLoaderData();
	return <SyllableHistory key={data.userId} data={data} />;
}
