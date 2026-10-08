import type { LeaderboardEntry } from "@/lib/leaderboard-types";
import {
	buildTriesHistogram,
	type TriesHistogramBucket,
} from "@/lib/tries-histogram";
import { cn } from "@/lib/utils";

type TriesHistogramProps = {
	entries: LeaderboardEntry[];
	// The local player's try count, when they have finished. Its bucket is drawn
	// in full primary and named in the caption, so the mark never rests on color
	// alone.
	highlightTries?: number | null;
	// Who the local player is on the leaderboard, so their own result is only
	// counted once: from the highlight until the stream echoes their finish
	// back, from their entry after that.
	selfParticipantId?: string | null;
	className?: string;
};

function finishersLabel(count: number): string {
	return count === 1 ? "1 ha acabat" : `${count} han acabat`;
}

function playingLabel(count: number): string {
	return count === 1 ? "1 encara juga" : `${count} encara juguen`;
}

function describeBucket(bucket: TriesHistogramBucket): string {
	const parts = [
		bucket.count > 0 ? finishersLabel(bucket.count) : null,
		bucket.inProgressCount > 0 ? playingLabel(bucket.inProgressCount) : null,
	].filter((part) => part != null);
	const players = parts.length > 0 ? parts.join(", ") : "ningú";
	return `${bucket.label} intents: ${players}`;
}

function hasPlayers(bucket: TriesHistogramBucket): boolean {
	return bucket.count + bucket.inProgressCount > 0;
}

export function TriesHistogram({
	entries,
	highlightTries,
	selfParticipantId,
	className,
}: TriesHistogramProps) {
	const { buckets, totalFinishers, totalInProgress, maxCount, highlightIndex } =
		buildTriesHistogram(entries, { highlightTries, selfParticipantId });

	// Nothing to show before anybody has played. A local player who has just
	// finished is always counted, so this only holds on an empty leaderboard.
	if (totalFinishers + totalInProgress === 0) {
		return null;
	}

	const summary = buckets.filter(hasPlayers).map(describeBucket).join("; ");
	const counts = [
		finishersLabel(totalFinishers),
		totalInProgress > 0 ? playingLabel(totalInProgress) : null,
	]
		.filter((part) => part != null)
		.join(" · ");
	const showYou = highlightIndex != null && highlightTries != null;

	return (
		<figure
			className={cn("mx-auto flex w-full max-w-md flex-col gap-1.5", className)}
		>
			<figcaption className="flex items-baseline justify-between gap-2 font-ui text-xs">
				<span className="font-semibold uppercase tracking-wider text-muted-foreground">
					Intents
				</span>
				<span className="tabular-nums text-muted-foreground">{counts}</span>
			</figcaption>

			<div role="img" aria-label={`Intents per jugador: ${summary}`}>
				<div className="flex h-14 items-end gap-1 border-b border-border/60 sm:h-16">
					{buckets.map((bucket, index) => (
						<div
							key={bucket.start}
							className="flex h-full min-w-0 flex-1 items-end"
							title={describeBucket(bucket)}
						>
							{hasPlayers(bucket) ? (
								<div
									className="flex w-full flex-col gap-px overflow-hidden rounded-t-[4px]"
									style={{
										// Keep a single player visible next to a tall bucket.
										height: `max(0.25rem, ${((bucket.count + bucket.inProgressCount) / maxCount) * 100}%)`,
									}}
								>
									{/* Still-playing players sit on top: their tries can only
									    grow, so they read as the part of the bar still moving. */}
									{bucket.inProgressCount > 0 ? (
										<div
											className="min-h-0 bg-muted-foreground/20"
											style={{ flexGrow: bucket.inProgressCount }}
										/>
									) : null}
									{bucket.count > 0 ? (
										<div
											className={cn(
												"min-h-0",
												index === highlightIndex
													? "bg-primary"
													: "bg-primary/30",
											)}
											style={{ flexGrow: bucket.count }}
										/>
									) : null}
								</div>
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

			{showYou || totalInProgress > 0 ? (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-[11px] text-muted-foreground">
					{showYou ? (
						<p className="flex items-center gap-1.5">
							<span
								className="size-2 shrink-0 rounded-[2px] bg-primary"
								aria-hidden
							/>
							Tu, amb {highlightTries}{" "}
							{highlightTries === 1 ? "intent" : "intents"}
						</p>
					) : null}
					{totalInProgress > 0 ? (
						<p className="flex items-center gap-1.5">
							<span
								className="size-2 shrink-0 rounded-[2px] bg-muted-foreground/20"
								aria-hidden
							/>
							Encara jugant
						</p>
					) : null}
				</div>
			) : null}
		</figure>
	);
}
