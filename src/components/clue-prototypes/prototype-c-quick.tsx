import {
	Check,
	ChevronLeft,
	ChevronRight,
	HelpingHand,
	History,
	Loader2,
	Pencil,
	Send,
	Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CLUE_LENGTH } from "@/lib/clue-fairness";
import { formatNames } from "./fake-clue-session";
import type { FakeRequest, FakeWord, GivenHint } from "./fake-data";
import type { CluePrototype, HelpRowsProps } from "./prototype-shared";
import {
	COMPOSER_TEXTAREA_CLASS_NAME,
	HELP_ROW_CLASS_NAME,
	minutesAgoLabel,
	reasonMessage,
} from "./prototype-shared";

// Prototype C: one reply per word, not per asker. The row shows a single ready
// suggestion (your latest hint for the word, then older ones, then the AI clue)
// with arrows to flip through them, and one tap sends it to everyone asking for
// that word. Writing your own is one tap away.

type Candidate =
	| {
			kind: "given";
			key: string;
			text: string;
			recipients: string[];
			minutesAgo: number;
	  }
	| { kind: "ai"; key: string; text: string };

function buildCandidates(
	word: FakeWord,
	openRequests: FakeRequest[],
	givenHints: GivenHint[],
): Candidate[] {
	const fromHints: Candidate[] = givenHints.map((given) => ({
		kind: "given",
		key: given.id,
		text: given.text,
		recipients: given.recipients,
		minutesAgo: given.minutesAgo,
	}));
	// Worth offering only while someone asking doesn't have it yet.
	const someoneLacksAiClue = openRequests.some(
		(request) => !request.requesterHasAiClue,
	);
	if (!word.aiClue || !someoneLacksAiClue) return fromHints;
	return [...fromHints, { kind: "ai", key: "ai", text: word.aiClue }];
}

// The AI clue skips askers who already unlocked it; anything else goes to every
// selected asker.
function recipientsFor(
	candidate: Candidate | null,
	selected: FakeRequest[],
): FakeRequest[] {
	if (candidate?.kind !== "ai") return selected;
	return selected.filter((request) => !request.requesterHasAiClue);
}

function sendLabel(count: number): string {
	return count > 1 ? `Envia a ${count}` : "Envia";
}

function RecipientToggles({
	requests,
	excluded,
	onToggle,
}: {
	requests: FakeRequest[];
	excluded: Set<string>;
	onToggle: (requestId: string) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5 py-1.5">
			<span className="mr-0.5 text-xs text-muted-foreground font-ui">
				Per a
			</span>
			{requests.map((request) => {
				const included = !excluded.has(request.id);
				return (
					<button
						key={request.id}
						type="button"
						aria-pressed={included}
						onClick={() => onToggle(request.id)}
						className={`flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-ui transition-colors lg:min-h-7 ${
							included
								? "border-primary bg-primary/10 text-primary"
								: "border-border text-muted-foreground line-through"
						}`}
					>
						{included ? <Check className="size-3" aria-hidden="true" /> : null}
						{request.requesterName}
					</button>
				);
			})}
		</div>
	);
}

function candidateMetaText(
	candidate: Candidate,
	skipped: FakeRequest[],
): string {
	if (candidate.kind === "given") {
		return `La teva · a ${formatNames(candidate.recipients)}, ${minutesAgoLabel(candidate.minutesAgo)}`;
	}
	if (skipped.length === 0) return "Pista IA";
	const names = formatNames(skipped.map((request) => request.requesterName));
	return `Pista IA · ${names} ja la ${skipped.length === 1 ? "té" : "tenen"}`;
}

function CandidateMeta({
	candidate,
	skipped,
}: {
	candidate: Candidate;
	skipped: FakeRequest[];
}) {
	return (
		<p className="flex items-center gap-1 text-xs text-muted-foreground font-ui">
			{candidate.kind === "ai" ? (
				<Sparkles className="size-3 shrink-0" aria-hidden="true" />
			) : (
				<History className="size-3 shrink-0" aria-hidden="true" />
			)}
			<span className="min-w-0">{candidateMetaText(candidate, skipped)}</span>
		</p>
	);
}

function HelpRows({
	word,
	openRequests,
	helped,
	givenHints,
	onSend,
}: HelpRowsProps) {
	const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
	const [index, setIndex] = useState(0);
	const [composing, setComposing] = useState(false);
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (openRequests.length === 0 && helped.length === 0) return null;

	const candidates = buildCandidates(word, openRequests, givenHints);
	const current =
		candidates.length > 0
			? (candidates[index % candidates.length] ?? null)
			: null;
	const selected = openRequests.filter((request) => !excluded.has(request.id));
	const quickRecipients = recipientsFor(current, selected);
	const skippedForAi = selected.filter(
		(request) => !quickRecipients.includes(request),
	);

	const reset = () => {
		setExcluded(new Set());
		setIndex(0);
		setComposing(false);
		setDraft("");
		setError(null);
	};

	const send = async (recipients: FakeRequest[], text: string) => {
		if (pending || text.trim().length === 0) return;
		setPending(true);
		setError(null);
		const result = await onSend(
			recipients.map((request) => request.id),
			text,
		);
		setPending(false);
		if (result.ok) {
			reset();
			return;
		}
		setError(reasonMessage(result.reason));
	};

	const step = (delta: number) => {
		setIndex(
			(currentIndex) =>
				(currentIndex + delta + candidates.length) % candidates.length,
		);
		setError(null);
	};

	const startComposing = (initial: string) => {
		setDraft(initial);
		setComposing(true);
		setError(null);
	};

	const toggleRecipient = (requestId: string) => {
		setExcluded((current) => {
			const next = new Set(current);
			if (next.has(requestId)) next.delete(requestId);
			else next.add(requestId);
			return next;
		});
		setError(null);
	};

	const helpedNames = helped.map((record) => record.requesterName);

	return (
		<div className="mt-1 flex min-w-0 flex-col pl-7">
			{openRequests.length > 1 ? (
				<RecipientToggles
					requests={openRequests}
					excluded={excluded}
					onToggle={toggleRecipient}
				/>
			) : openRequests[0] ? (
				<span className={`${HELP_ROW_CLASS_NAME} text-primary`}>
					<HelpingHand className="size-3.5 shrink-0" />
					{openRequests[0].requesterName} demana ajuda
				</span>
			) : null}

			{openRequests.length > 0 && composing ? (
				<div className="flex w-full flex-col gap-2 py-1">
					<Textarea
						autoFocus
						value={draft}
						maxLength={MAX_CLUE_LENGTH}
						onChange={(event) => {
							setDraft(event.target.value);
							setError(null);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void send(selected, draft);
							}
						}}
						placeholder="Escriu una pista (sense dir la paraula!)"
						className={COMPOSER_TEXTAREA_CLASS_NAME}
						aria-label="Pista nova"
						aria-invalid={error != null}
					/>
					{error ? <p className="text-xs text-destructive">{error}</p> : null}
					<div className="flex items-center justify-end gap-2">
						<Button
							variant="text"
							size="sm"
							onClick={() => {
								setComposing(false);
								setError(null);
							}}
							disabled={pending}
						>
							{candidates.length > 0 ? "Enrere" : "Ara no"}
						</Button>
						<Button
							size="sm"
							className="gap-1.5 hover:bg-primary/85"
							onClick={() => void send(selected, draft)}
							disabled={
								pending || draft.trim().length === 0 || selected.length === 0
							}
						>
							{pending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Send className="size-4" />
							)}
							{sendLabel(selected.length)}
						</Button>
					</div>
				</div>
			) : null}

			{openRequests.length > 0 && !composing && current ? (
				<div className="flex flex-col gap-1">
					<div className="rounded-lg border border-border bg-muted/40 px-3 pt-2.5 pb-1.5">
						<p className="text-sm leading-snug wrap-anywhere">{current.text}</p>
						{candidates.length > 1 ? (
							<div className="mt-1">
								<CandidateMeta candidate={current} skipped={skippedForAi} />
							</div>
						) : null}
						<div className="mt-1 flex items-center gap-2">
							{candidates.length > 1 ? (
								<div className="-ml-2 flex items-center">
									<Button
										type="button"
										variant="text"
										size="icon"
										className="size-10 text-muted-foreground hover:text-primary lg:size-8"
										aria-label="Suggeriment anterior"
										onClick={() => step(-1)}
									>
										<ChevronLeft className="size-4" />
									</Button>
									<span className="text-xs tabular-nums text-muted-foreground font-ui">
										{(index % candidates.length) + 1}/{candidates.length}
									</span>
									<Button
										type="button"
										variant="text"
										size="icon"
										className="size-10 text-muted-foreground hover:text-primary lg:size-8"
										aria-label="Suggeriment següent"
										onClick={() => step(1)}
									>
										<ChevronRight className="size-4" />
									</Button>
								</div>
							) : (
								<div className="min-w-0 flex-1">
									<CandidateMeta candidate={current} skipped={skippedForAi} />
								</div>
							)}
							<div className="ml-auto flex shrink-0 items-center gap-1">
								<Button
									type="button"
									variant="text"
									size="icon"
									className="size-10 text-muted-foreground hover:text-primary lg:size-8"
									aria-label="Edita abans d'enviar"
									title="Edita abans d'enviar"
									onClick={() => startComposing(current.text)}
								>
									<Pencil className="size-3.5" />
								</Button>
								<Button
									size="sm"
									className="gap-1.5 hover:bg-primary/85"
									onClick={() => void send(quickRecipients, current.text)}
									disabled={pending || quickRecipients.length === 0}
								>
									{pending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Send className="size-4" />
									)}
									{sendLabel(quickRecipients.length)}
								</Button>
							</div>
						</div>
					</div>
					{error ? <p className="text-xs text-destructive">{error}</p> : null}
					<Button
						type="button"
						variant="text"
						size="sm"
						className={`${HELP_ROW_CLASS_NAME} h-auto justify-start border-0 px-0 font-normal whitespace-normal text-primary`}
						onClick={() => startComposing("")}
					>
						<Pencil className="size-3.5" />
						Escriu-ne una de nova
					</Button>
				</div>
			) : null}

			{openRequests.length > 0 && !composing && !current ? (
				<Button
					type="button"
					variant="text"
					size="sm"
					className={`${HELP_ROW_CLASS_NAME} h-auto justify-start border-0 px-0 font-normal whitespace-normal text-primary`}
					onClick={() => startComposing("")}
				>
					<Pencil className="size-3.5" />
					Escriu una pista
				</Button>
			) : null}

			{helpedNames.length > 0 ? (
				<span className={`${HELP_ROW_CLASS_NAME} text-muted-foreground`}>
					<Check className="size-3.5 shrink-0" />
					Has ajudat {formatNames(helpedNames)}
				</span>
			) : null}
		</div>
	);
}

export const prototypeC: CluePrototype = {
	id: "c",
	name: "Resposta ràpida",
	summary:
		"Una resposta per paraula. Hi ha un suggeriment llest (la teva última pista, les anteriors o la IA) i un toc l'envia a tothom qui la demana. Pots canviar de suggeriment, editar-lo o escriure'n una de nova.",
	HelpRows,
	hidesAiClue: (openRequests) =>
		openRequests.some((request) => !request.requesterHasAiClue),
};
