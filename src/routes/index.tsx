import { Await, createFileRoute } from "@tanstack/react-router";
import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Daily } from "@/components/daily/daily";
import type { DailyData } from "@/components/daily/daily-types";
import {
	getDailyPuzzlePageData,
	pollDailyPuzzleReady,
} from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/")({
	// Return the promise without awaiting so TanStack Router treats it as
	// deferred data. During SSR the server streams the loading shell
	// immediately instead of blocking until the data resolves.
	loader: () => ({ data: getDailyPuzzlePageData() }),
	component: IndexPage,
});

function IndexPage() {
	const { data } = Route.useLoaderData();

	return (
		<Await promise={data} fallback={<DailyLoadingPage />}>
			{(resolvedData) => {
				if (resolvedData.status === "generating") {
					return <PuzzleGeneratingPage />;
				}
				return <Daily initialData={resolvedData} />;
			}}
		</Await>
	);
}

function PuzzleGeneratingPage() {
	const [initialData, setInitialData] = useState<DailyData | null>(null);
	const cancelledRef = useRef(false);

	useEffect(() => {
		cancelledRef.current = false;

		async function poll() {
			if (cancelledRef.current) return;

			try {
				const result = await pollDailyPuzzleReady();
				if (result) {
					if (!cancelledRef.current) {
						setInitialData(result as unknown as DailyData);
					}
					return;
				}
			} catch {
				// Ignore errors, keep polling
			}

			if (!cancelledRef.current) {
				setTimeout(poll, 2_000);
			}
		}

		poll();

		return () => {
			cancelledRef.current = true;
		};
	}, []);

	if (initialData) return <Daily initialData={initialData} />;
	return <DailyLoadingPage />;
}

export function DailyLoadingPage() {
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
