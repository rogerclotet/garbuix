import { createFileRoute } from "@tanstack/react-router";
import { PuzzleLoadingPage } from "@/components/puzzle/puzzle-loading";
import { Syllable } from "@/components/syllables/syllable";
import { getSyllablePageData } from "@/lib/syllable-server-fns";

export const Route = createFileRoute("/sillabes/")({
	loader: () => getSyllablePageData(),
	pendingComponent: PuzzleLoadingPage,
	head: () => ({ meta: [{ title: "Garbuix síl·labes" }] }),
	component: SyllablePage,
});

function SyllablePage() {
	const data = Route.useLoaderData();
	return (
		<Syllable key={`${data.puzzle.id}:${data.userId}`} initialData={data} />
	);
}
