import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Daily } from "@/components/daily/daily";
import { DailyLoadingPage } from "@/components/daily/daily-loading";
import type { DailyData } from "@/components/daily/daily-types";
import { useDailyRollover } from "@/components/daily/use-daily-rollover";
import {
	getDailyPuzzlePageData,
	pollDailyPuzzleReady,
} from "@/lib/puzzle-server-fns";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

export const Route = createFileRoute("/")({
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

	return <ReadyDailyPage initialData={data} />;
}

function ReadyDailyPage({ initialData }: { initialData: DailyData }) {
	const sourceRef = useRef<DailyData | null>(initialData);
	useIsomorphicLayoutEffect(() => {
		sourceRef.current = initialData;
		return () => {
			sourceRef.current = null;
		};
	}, [initialData]);
	const [replacement, setReplacement] = useState<{
		source: DailyData;
		data: DailyData;
	} | null>(null);
	const data =
		replacement?.source === initialData ? replacement.data : initialData;
	const refresh = useCallback(async () => {
		// Keep rollover reads outside router invalidation: a network error must
		// leave this retrying transition mounted, rather than open the route error page.
		const next = await pollDailyPuzzleReady();
		if (next && sourceRef.current === initialData)
			setReplacement({ source: initialData, data: next });
	}, [initialData]);
	const expired = useDailyRollover(data.rolloverAt, refresh);
	return expired ? <DailyLoadingPage /> : <Daily initialData={data} />;
}

function PuzzleGeneratingPage() {
	const [initialData, setInitialData] = useState<DailyData | null>(null);

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		async function poll() {
			if (cancelled) return;

			try {
				const result = await pollDailyPuzzleReady();
				if (result) {
					if (!cancelled) {
						setInitialData(result);
					}
					return;
				}
			} catch {
				// Ignore errors, keep polling
			}

			if (!cancelled) {
				timer = setTimeout(poll, 2_000);
			}
		}

		poll();

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, []);

	if (initialData) return <ReadyDailyPage initialData={initialData} />;
	return <DailyLoadingPage />;
}
