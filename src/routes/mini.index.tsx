import { createFileRoute } from "@tanstack/react-router";
import { Mini } from "@/components/mini/mini";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { getMiniPageData } from "@/lib/mini-server-fns";

export const Route = createFileRoute("/mini/")({
	loader: () => getMiniPageData(),
	pendingComponent: PuzzleLoadingPage,
	head: () => ({ meta: [{ title: "Garbuix mini" }] }),
	component: MiniPage,
});

function MiniPage() {
	const data = Route.useLoaderData();
	return <Mini key={`${data.puzzle.id}:${data.userId}`} initialData={data} />;
}
