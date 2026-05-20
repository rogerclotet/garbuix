import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
	getLeaderboardOptOut,
	setLeaderboardOptOut,
} from "@/lib/anon-identity";
import { useObservability } from "@/lib/use-observability";

export const Route = createFileRoute("/preferencies")({
	component: PreferencesPage,
});

function PreferencesPage() {
	const { captureEvent } = useObservability();
	const leaderboardToggleId = useId();
	const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);

	useEffect(() => {
		setShowOnLeaderboard(!getLeaderboardOptOut());
	}, []);

	const handleToggleLeaderboard = (next: boolean) => {
		setShowOnLeaderboard(next);
		setLeaderboardOptOut(!next);
		captureEvent("leaderboard_opt_out_toggled", { opt_out: !next });
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
			<p className="text-muted-foreground text-sm">
				Ajusta com vols jugar i compartir el teu progrés.
			</p>
			<section className="rounded-xl border border-border/40 bg-muted/30 divide-y divide-border/40">
				<label
					htmlFor={leaderboardToggleId}
					className="flex items-start justify-between gap-4 p-4 sm:p-5 cursor-pointer"
				>
					<div className="space-y-1">
						<div className="font-medium">Mostra'm a la classificació</div>
						<p className="text-sm text-muted-foreground font-ui">
							Apareix al rànquing diari amb el teu nom o àlies. Si ho
							desactives, els teus resultats no es publicaran.
						</p>
					</div>
					<Switch
						id={leaderboardToggleId}
						checked={showOnLeaderboard}
						onCheckedChange={handleToggleLeaderboard}
					/>
				</label>
			</section>
		</div>
	);
}
