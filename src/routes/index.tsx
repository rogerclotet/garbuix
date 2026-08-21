import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Daily } from "@/components/daily/daily";
import { DailyLoadingPage } from "@/components/daily/daily-loading";
import type { DailyData } from "@/components/daily/daily-types";
import {
	getDailyPuzzlePageData,
	pollDailyPuzzleReady,
} from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/")({
	// Awaited, so the board is part of the server-rendered document and the
	// browser paints the puzzle itself instead of a loading screen it has to
	// swap out once React hydrates. Deferring it used to save the wait on a
	// missing puzzle, but the handler already returns a "generating" status
	// without blocking on generation, so this only costs the puzzle read.
	loader: () => getDailyPuzzlePageData(),
	// Only reached when the read is slow enough for the router's pending delay
	// to elapse; a normal navigation stays on the current page until the board
	// is ready to render.
	pendingComponent: DailyLoadingPage,
	component: IndexPage,
});

function IndexPage() {
	const data = Route.useLoaderData();

	if (data.status === "generating") {
		return <PuzzleGeneratingPage />;
	}

	return <Daily initialData={data} />;
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
