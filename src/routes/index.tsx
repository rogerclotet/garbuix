import { Await, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Daily } from "@/components/daily/daily";
import { DailyLoadingPage } from "@/components/daily/daily-loading";
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
