import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LeaderboardEntry } from "@/lib/leaderboard-types";
import { initialsFromName } from "@/lib/user-profile";
import { cn } from "@/lib/utils";

const timeFormatter = new Intl.DateTimeFormat("ca-ES", {
	hour: "2-digit",
	minute: "2-digit",
});

type LeaderboardRowProps = {
	rank: number;
	entry: LeaderboardEntry;
	highlighted?: boolean;
};

export function LeaderboardRow({
	rank,
	entry,
	highlighted = false,
}: LeaderboardRowProps) {
	const completed = entry.completedAt != null;
	return (
		<li
			className={cn(
				"flex items-center gap-3 rounded-md border border-transparent px-3 py-2",
				highlighted && "border-border bg-muted/60 text-foreground",
			)}
			aria-current={highlighted ? "true" : undefined}
		>
			<span className="w-6 shrink-0 text-right font-mono text-muted-foreground text-sm tabular-nums">
				{rank}
			</span>
			<Avatar className="size-8 border border-border">
				{entry.image ? (
					<AvatarImage
						src={entry.image}
						alt={entry.name}
						referrerPolicy="no-referrer"
					/>
				) : (
					<AvatarFallback className="bg-muted text-muted-foreground text-xs">
						{initialsFromName(entry.name)}
					</AvatarFallback>
				)}
			</Avatar>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-sm font-medium">
					{entry.name}
					{entry.kind === "anon" ? (
						<span className="ml-1 text-muted-foreground text-xs">
							(convidat)
						</span>
					) : null}
				</span>
				{completed ? (
					<span className="text-muted-foreground text-xs">
						Completat a les{" "}
						{timeFormatter.format(new Date(entry.completedAt ?? ""))}
					</span>
				) : null}
			</div>
			<div className="shrink-0 text-right">
				<div className="font-semibold text-sm tabular-nums">
					{entry.wordsFound}
					<span className="text-muted-foreground"> / {entry.totalWords}</span>
				</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{entry.clueCount} {entry.clueCount === 1 ? "pista" : "pistes"} ·{" "}
					{entry.tryCount} {entry.tryCount === 1 ? "intent" : "intents"}
				</div>
			</div>
		</li>
	);
}
