import { createFileRoute } from "@tanstack/react-router";
import { DailyLoadingPage } from "@/components/daily/daily-loading";
import { Mini } from "@/components/mini/mini";
import { getMiniPageData } from "@/lib/mini-server-fns";

export const Route = createFileRoute("/mini/")({
	loader: () => getMiniPageData(),
	pendingComponent: DailyLoadingPage,
	head: () => ({ meta: [{ title: "Garbuixmini · Cinc paraules cada dia" }] }),
	component: MiniPage,
});

function MiniPage() {
	const data = Route.useLoaderData();
	return <Mini key={`${data.puzzle.id}:${data.userId}`} initialData={data} />;
}
