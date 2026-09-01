import type { LeaderboardEntry } from "@/lib/leaderboard-types";
import { buildTriesHistogram } from "@/lib/tries-histogram";
import { cn } from "@/lib/utils";

type TriesHistogramProps = {
	entries: LeaderboardEntry[];
	// The local player's try count, when they have finished. Its bucket is drawn
	// in full primary and named in the caption, so the mark never rests on color
	// alone.
	highlightTries?: number | null;
	className?: string;
};

function playersLabel(count: number): string {
	return count === 1 ? "1 jugador" : `${count} jugadors`;
}

function finishersLabel(count: number): string {
	return count === 1 ? "1 ha acabat" : `${count} han acabat`;
}

function describeBucket(label: string, count: number): string {
	return `${playersLabel(count)} amb ${label} intents`;
}

export function TriesHistogram({
	entries,
	highlightTries,
	className,
}: TriesHistogramProps) {
	const { buckets, totalFinishers, maxCount, highlightIndex } =
		buildTriesHistogram(entries, { highlightTries });

	// Nothing to show before the first player finishes (or when the leaderboard
	// isn't available at all).
	if (totalFinishers === 0) {
		return null;
	}

	const summary = buckets
		.filter((bucket) => bucket.count > 0)
		.map((bucket) => describeBucket(bucket.label, bucket.count))
		.join(", ");

	return (
		<figure className={cn("flex flex-col gap-1.5", className)}>
			<figcaption className="flex items-baseline justify-between gap-2 font-ui text-xs">
				<span className="font-semibold uppercase tracking-wider text-muted-foreground">
					Intents per acabar
				</span>
				<span className="tabular-nums text-muted-foreground">
					{finishersLabel(totalFinishers)}
				</span>
			</figcaption>

			<div role="img" aria-label={`Intents de qui ha acabat: ${summary}`}>
				{/* Selective labels: the tallest bucket and the player's own, so the
				    scale is readable without a number over every bar. */}
				<div className="flex items-end gap-1" aria-hidden>
					{buckets.map((bucket, index) => {
						const labelled =
							bucket.count > 0 &&
							(bucket.count === maxCount || index === highlightIndex);
						return (
							<span
								key={bucket.start}
								className="min-w-0 flex-1 text-center font-ui text-[10px] leading-4 text-muted-foreground tabular-nums"
							>
								{labelled ? bucket.count : ""}
							</span>
						);
					})}
				</div>

				<div className="flex h-14 items-end gap-1 border-b border-border/60 sm:h-16">
					{buckets.map((bucket, index) => (
						<div
							key={bucket.start}
							className="flex h-full min-w-0 flex-1 items-end"
							title={describeBucket(bucket.label, bucket.count)}
						>
							{bucket.count > 0 ? (
								<div
									className={cn(
										"w-full rounded-t-[4px]",
										index === highlightIndex ? "bg-primary" : "bg-primary/30",
									)}
									style={{
										// Keep a single player visible next to a tall bucket.
										height: `max(0.25rem, ${(bucket.count / maxCount) * 100}%)`,
									}}
								/>
							) : null}
						</div>
					))}
				</div>

				<div className="flex gap-1 pt-1" aria-hidden>
					{buckets.map((bucket, index) => (
						<span
							key={bucket.start}
							className={cn(
								"min-w-0 flex-1 text-center font-ui text-[10px] leading-4 tabular-nums",
								index === highlightIndex
									? "font-semibold text-foreground"
									: "text-muted-foreground/70",
							)}
						>
							{bucket.end == null ? `${bucket.start}+` : bucket.start}
						</span>
					))}
				</div>
			</div>

			{highlightIndex != null && highlightTries != null ? (
				<p className="flex items-center gap-1.5 font-ui text-[11px] text-muted-foreground">
					<span
						className="size-2 shrink-0 rounded-[2px] bg-primary"
						aria-hidden
					/>
					Tu, amb {highlightTries} {highlightTries === 1 ? "intent" : "intents"}
				</p>
			) : null}
		</figure>
	);
}
