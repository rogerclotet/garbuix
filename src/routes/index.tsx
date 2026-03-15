import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2Icon, RotateCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Daily } from "@/components/daily/daily";
import type { DailyData } from "@/components/daily/daily-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDailyPuzzlePageData } from "@/lib/puzzle-server-fns";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	const fetchDailyPuzzlePageData = useServerFn(getDailyPuzzlePageData);
	const [dailyData, setDailyData] = useState<DailyData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const loadPuzzle = async () => {
			setError(null);
			setIsLoading(true);

			try {
				const nextData = await fetchDailyPuzzlePageData();
				if (!cancelled) {
					setDailyData(nextData);
				}
			} catch (nextError) {
				if (!cancelled) {
					const message =
						nextError instanceof Error
							? nextError.message
							: "No s'ha pogut carregar el repte d'avui.";
					setError(message);
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		void loadPuzzle();

		return () => {
			cancelled = true;
		};
	}, [fetchDailyPuzzlePageData]);

	const retryLoad = async () => {
		setError(null);
		setIsRefreshing(true);

		try {
			const nextData = await fetchDailyPuzzlePageData();
			setDailyData(nextData);
		} catch (nextError) {
			const message =
				nextError instanceof Error
					? nextError.message
					: "No s'ha pogut carregar el repte d'avui.";
			setError(message);
		} finally {
			setIsRefreshing(false);
		}
	};

	if (dailyData) {
		return <Daily initialData={dailyData} />;
	}

	if (error && !isLoading) {
		return (
			<DailyLoadError
				error={error}
				isRetrying={isRefreshing}
				onRetry={() => void retryLoad()}
			/>
		);
	}

	return <DailyLoadingPage isRefreshing={isRefreshing} />;
}

function DailyLoadingPage({
	isRefreshing = false,
}: {
	isRefreshing?: boolean;
}) {
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
					{isRefreshing ? (
						<p className="text-xs uppercase tracking-[0.2em] text-primary/70">
							Reintentant...
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}

function DailyLoadError({
	error,
	isRetrying,
	onRetry,
}: {
	error: string;
	isRetrying: boolean;
	onRetry: () => void;
}) {
	return (
		<div className="relative overflow-hidden px-4 py-10 sm:px-6">
			<div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-destructive/10 to-transparent" />
			<div className="mx-auto max-w-xl">
				<Card className="border-destructive/20 shadow-sm">
					<CardHeader>
						<CardTitle>No s'ha pogut carregar el repte</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-muted-foreground">{error}</p>
						<Button onClick={onRetry} disabled={isRetrying} className="gap-2">
							<RotateCwIcon
								className={isRetrying ? "size-4 animate-spin" : "size-4"}
							/>
							Tornar-ho a provar
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
