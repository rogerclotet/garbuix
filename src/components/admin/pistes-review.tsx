import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
	ClueReviewChoice,
	ClueReviewItem,
	CluesForReview,
	HintModelName,
	ModelRatingSummary,
} from "@/lib/clue-types";
import {
	getCluesForReview,
	getModelRatingSummary,
	submitClueRating,
} from "@/lib/puzzle-server-fns";

export type PistesReviewData =
	| { authorized: false }
	| {
			authorized: true;
			clues: CluesForReview;
			summary: ModelRatingSummary;
	  };

const MODEL_LABELS: Record<HintModelName, string> = {
	sonnet: "Sonnet",
	haiku: "Haiku",
};

export function PistesReview({
	initialData,
}: {
	initialData: PistesReviewData;
}) {
	if (!initialData.authorized) {
		return (
			<main className="max-w-2xl mx-auto px-4 py-16 text-center">
				<h1 className="text-2xl font-semibold text-foreground">
					Accés restringit
				</h1>
				<p className="mt-3 text-muted-foreground font-ui">
					Aquesta pàgina només és accessible per a administradors.
				</p>
			</main>
		);
	}

	return (
		<PistesReviewAuthorized
			initialClues={initialData.clues}
			initialSummary={initialData.summary}
		/>
	);
}

function PistesReviewAuthorized({
	initialClues,
	initialSummary,
}: {
	initialClues: CluesForReview;
	initialSummary: ModelRatingSummary;
}) {
	const [dateKey, setDateKey] = useState(initialClues.dateKey);
	const [clues, setClues] = useState(initialClues);
	const [summary, setSummary] = useState(initialSummary);
	const [isLoading, setIsLoading] = useState(false);

	const refresh = useCallback(async (nextDateKey: string) => {
		setIsLoading(true);
		try {
			const [nextClues, nextSummary] = await Promise.all([
				getCluesForReview({ data: { dateKey: nextDateKey } }),
				getModelRatingSummary({ data: { dateKey: nextDateKey } }),
			]);
			setClues(nextClues);
			setSummary(nextSummary);
		} catch (error) {
			console.error("Failed to load clue review", error);
			toast.error("No s'han pogut carregar les pistes");
		} finally {
			setIsLoading(false);
		}
	}, []);

	const handleDateChange = useCallback(
		(nextDateKey: string) => {
			setDateKey(nextDateKey);
			if (nextDateKey) {
				void refresh(nextDateKey);
			}
		},
		[refresh],
	);

	const refreshSummary = useCallback(async () => {
		try {
			const nextSummary = await getModelRatingSummary({ data: { dateKey } });
			setSummary(nextSummary);
		} catch (error) {
			console.error("Failed to refresh rating summary", error);
		}
	}, [dateKey]);

	const handleRated = useCallback(
		(clueId: string, winner: ClueReviewChoice) => {
			setClues((current) => ({
				...current,
				items: current.items.map((item) =>
					item.clueId === clueId ? { ...item, currentChoice: winner } : item,
				),
			}));
			void refreshSummary();
		},
		[refreshSummary],
	);

	return (
		<main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					Revisió de pistes
				</h1>
				<p className="text-sm text-muted-foreground font-ui">
					Comparació cega de les pistes generades per cada model. Tria la millor
					pista de cada paraula; el model es revela després de votar.
				</p>
				<label className="flex items-center gap-2 text-sm font-ui">
					<span className="text-muted-foreground">Dia</span>
					<input
						type="date"
						value={dateKey}
						onChange={(event) => handleDateChange(event.target.value)}
						className="rounded-lg border border-border bg-background px-2.5 py-1.5"
					/>
				</label>
			</header>

			<RatingSummary summary={summary} />

			{isLoading ? (
				<p className="text-muted-foreground font-ui">Carregant…</p>
			) : !clues.hasPuzzle ? (
				<p className="text-muted-foreground font-ui">
					No hi ha cap puzzle per a aquest dia.
				</p>
			) : clues.items.length === 0 ? (
				<p className="text-muted-foreground font-ui">
					Encara no s'han generat pistes per a aquest puzzle.
				</p>
			) : (
				<ul className="space-y-4">
					{clues.items.map((item) => (
						<ClueReviewCard
							key={item.clueId}
							item={item}
							onRated={handleRated}
						/>
					))}
				</ul>
			)}
		</main>
	);
}

function RatingSummary({ summary }: { summary: ModelRatingSummary }) {
	const models: HintModelName[] = ["sonnet", "haiku"];

	return (
		<div className="grid grid-cols-2 gap-3">
			{models.map((model) => {
				const counts = summary.perModel[model];
				return (
					<div
						key={model}
						className="rounded-lg border border-border bg-muted/30 px-4 py-3 font-ui"
					>
						<div className="text-sm font-semibold text-foreground">
							{MODEL_LABELS[model]}
						</div>
						<div className="mt-1 text-xs text-muted-foreground">
							{counts.win} guanyades · {counts.loss} perdudes · {counts.tie}{" "}
							empats
						</div>
					</div>
				);
			})}
		</div>
	);
}

function ClueReviewCard({
	item,
	onRated,
}: {
	item: ClueReviewItem;
	onRated: (clueId: string, winner: ClueReviewChoice) => void;
}) {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const revealed = item.currentChoice != null;

	const submit = useCallback(
		async (winner: ClueReviewChoice) => {
			setIsSubmitting(true);
			try {
				await submitClueRating({ data: { clueId: item.clueId, winner } });
				onRated(item.clueId, winner);
			} catch (error) {
				console.error("Failed to submit rating", error);
				toast.error("No s'ha pogut desar la valoració");
			} finally {
				setIsSubmitting(false);
			}
		},
		[item.clueId, onRated],
	);

	return (
		<li className="rounded-lg border border-border bg-background p-4 space-y-3">
			<div className="flex items-center justify-between gap-2 font-ui">
				<span className="text-sm font-semibold text-foreground">
					{item.displayWord.toUpperCase()}
				</span>
				<span className="text-xs uppercase tracking-wider text-muted-foreground">
					{item.areatematica || "Sense categoria"}
				</span>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<ClueOption
					label="A"
					clue={item.clueA}
					model={item.modelA}
					revealed={revealed}
					selected={item.currentChoice === "a"}
					disabled={isSubmitting}
					onSelect={() => submit("a")}
				/>
				<ClueOption
					label="B"
					clue={item.clueB}
					model={item.modelB}
					revealed={revealed}
					selected={item.currentChoice === "b"}
					disabled={isSubmitting}
					onSelect={() => submit("b")}
				/>
			</div>

			<div className="flex justify-center">
				<Button
					variant={item.currentChoice === "tie" ? "secondary" : "ghost"}
					size="sm"
					disabled={isSubmitting}
					onClick={() => submit("tie")}
				>
					Empat
				</Button>
			</div>
		</li>
	);
}

function ClueOption({
	label,
	clue,
	model,
	revealed,
	selected,
	disabled,
	onSelect,
}: {
	label: string;
	clue: string;
	model: HintModelName;
	revealed: boolean;
	selected: boolean;
	disabled: boolean;
	onSelect: () => void;
}) {
	return (
		<div
			className={`flex flex-col gap-2 rounded-lg border p-3 ${
				selected ? "border-primary bg-primary/8" : "border-border bg-muted/20"
			}`}
		>
			<div className="flex items-center justify-between font-ui">
				<span className="text-xs font-semibold text-muted-foreground">
					Pista {label}
				</span>
				{revealed ? (
					<span className="text-xs text-muted-foreground">
						{MODEL_LABELS[model]}
					</span>
				) : null}
			</div>
			<p className="text-sm text-foreground">{clue}</p>
			<Button
				variant={selected ? "default" : "outline"}
				size="sm"
				disabled={disabled}
				onClick={onSelect}
			>
				Tria {label}
			</Button>
		</div>
	);
}
