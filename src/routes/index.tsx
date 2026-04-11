import { createFileRoute } from "@tanstack/react-router";
import { Loader2Icon } from "lucide-react";
import { Daily } from "@/components/daily/daily";
import { getDailyPuzzlePageData } from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/")({
	loader: async () => getDailyPuzzlePageData(),
	component: IndexPage,
	pendingComponent: DailyLoadingPage,
});

function IndexPage() {
	return <Daily initialData={Route.useLoaderData()} />;
}

function DailyLoadingPage() {
	return (
		<div className="relative overflow-hidden">
			<div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-primary/12 to-transparent" />
			<div className="mx-auto flex min-h-[calc(100svh-6rem)] max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
				<div className="rounded-full border border-primary/20 bg-primary/10 p-4 text-primary shadow-sm">
					<Loader2Icon className="size-8 animate-spin" />
				</div>
				<div className="space-y-2">
					<h2 className="text-2xl font-semibold tracking-tight">
						Carregant el repte d'avui
					</h2>
					<p className="max-w-md text-sm text-muted-foreground sm:text-base">
						Estem preparant les lletres i les paraules del trencaclosques.
					</p>
				</div>
			</div>
		</div>
	);
}
