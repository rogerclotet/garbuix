import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type DailySyncDebugProps = {
	canSync: boolean;
	isOnline: boolean;
	isSyncing: boolean;
	lastSyncedAt: string | null;
	nextSyncRetryAt: number | null;
	onManualSync: () => void;
	queuedEventCount: number;
};

function formatTimestamp(value: string | number | null) {
	if (value == null) {
		return "encara no";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "desconegut";
	}

	return new Intl.DateTimeFormat("ca-ES", {
		dateStyle: "short",
		timeStyle: "medium",
	}).format(date);
}

export function DailySyncDebug({
	canSync,
	isOnline,
	isSyncing,
	lastSyncedAt,
	nextSyncRetryAt,
	onManualSync,
	queuedEventCount,
}: DailySyncDebugProps) {
	const syncedLabel =
		!canSync || !isOnline
			? "no"
			: isSyncing
				? "ara"
				: lastSyncedAt
					? formatTimestamp(lastSyncedAt)
					: "no";

	return (
		<div className="mt-6 flex justify-center">
			<div className="w-full max-w-xl px-4 py-2 text-xs text-muted-foreground/70">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<p>
							Sincronitzat: {syncedLabel} · pendents: {queuedEventCount}
						</p>
						<p>
							{nextSyncRetryAt
								? `Pròxim reintent: ${formatTimestamp(nextSyncRetryAt)}`
								: "Sense reintents pendents"}
						</p>
					</div>

					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 justify-center px-2 text-muted-foreground/70 hover:text-foreground"
						onClick={onManualSync}
						disabled={!canSync || !isOnline || isSyncing}
					>
						<RefreshCw
							className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
						/>
						Forçar sync
					</Button>
				</div>
			</div>
		</div>
	);
}
