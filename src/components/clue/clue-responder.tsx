import {
	Copy,
	History,
	Loader2,
	type LucideIcon,
	Pencil,
	Send,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { REVEAL_DURATION_MS, Reveal } from "@/components/ui/reveal";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CLUE_LENGTH } from "@/lib/clue-fairness";
import type { ClueHelpGiven, ClueRequest } from "@/lib/clue-request-types";
import type { RespondResult } from "@/lib/use-clue-requests";

// A hint this player already sent today for a word, with everyone it went to.
export type GivenHint = {
	text: string;
	recipients: string[];
	at: string;
};

// Older hints wait behind a "+N més" chip so the panel stays a couple of rows.
const VISIBLE_HINT_CHIPS = 2;

const nameList = new Intl.ListFormat("ca", {
	style: "long",
	type: "conjunction",
});

// The player's help records for one word as reusable hints, newest first. The
// same text sent to several askers is one hint. Records written before hints
// were kept have no text and are left out.
export function collectGivenHints(
	records: ClueHelpGiven[],
	wordId: number,
): GivenHint[] {
	const byText = new Map<string, GivenHint>();
	for (const record of records) {
		if (record.wordId !== wordId || !record.text) continue;
		const key = record.text.toLocaleLowerCase("ca");
		const existing = byText.get(key);
		if (!existing) {
			byText.set(key, {
				text: record.text,
				recipients: [record.requesterName],
				at: record.at,
			});
			continue;
		}
		existing.recipients.push(record.requesterName);
		if (record.at > existing.at) existing.at = record.at;
	}
	return [...byText.values()].sort((a, b) => b.at.localeCompare(a.at));
}

function sentAgoLabel(at: string, now: number): string {
	const minutes = Math.floor((now - Date.parse(at)) / 60_000);
	if (!Number.isFinite(minutes) || minutes < 1) return "ara mateix";
	if (minutes < 60) return `fa ${minutes} min`;
	return `fa ${Math.floor(minutes / 60)} h`;
}

function reasonMessage(reason: string | null): string {
	switch (reason) {
		case "too_similar":
			return "La pista s'assembla massa a la paraula";
		case "too_long":
			return "La pista és massa llarga";
		case "empty":
			return "Escriu alguna cosa";
		case "already_helped":
			return "Ja has ajudat amb aquesta paraula";
		default:
			return "No s'ha pogut enviar la pista";
	}
}

type Choice =
	| { kind: "copy" }
	| { kind: "given"; text: string }
	| { kind: "own" }
	| null;

function ChoiceChip({
	icon: Icon,
	label,
	title,
	selected,
	disabled = false,
	short = false,
	onSelect,
}: {
	icon: LucideIcon;
	label: string;
	title?: string;
	selected: boolean;
	disabled?: boolean;
	// Cut free text early: the preview below shows it in full once picked.
	short?: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			title={title}
			aria-pressed={selected}
			disabled={disabled}
			className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-ui transition-colors disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-8 ${
				short ? "max-w-36" : "max-w-full"
			} ${
				selected
					? "border-primary bg-primary/10 text-primary"
					: "border-border bg-background text-foreground enabled:hover:border-primary/60"
			}`}
		>
			<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="truncate">{label}</span>
		</button>
	);
}

function HintPreview({ hint }: { hint: GivenHint }) {
	return (
		<div className="rounded-sm border border-border bg-muted/40 px-2.5 py-2">
			<p className="text-sm leading-snug wrap-anywhere">{hint.text}</p>
			<p className="mt-1 text-xs text-muted-foreground font-ui">
				Enviada a {nameList.format(hint.recipients)} ·{" "}
				{sentAgoLabel(hint.at, Date.now())}
			</p>
		</div>
	);
}

// Reply to a peer's clue request from the word list. Each chip is one way to
// help: copy the word's clue, resend a hint already given to someone else for
// this word, or write a new one. A chip only selects; Enviar sends. The text box
// exists only for writing a new one. Fairness feedback (e.g. "too similar")
// surfaces inline rather than as a separate toast.
export function ClueResponder({
	request,
	clueText,
	givenHints,
	onRespond,
	onDone,
}: {
	request: ClueRequest;
	// The word's own clue, as shown on the word list. Null while it's missing.
	clueText: string | null;
	// This player's earlier hints for the word, newest first.
	givenHints: GivenHint[];
	onRespond: (requestId: string, text: string) => Promise<RespondResult>;
	onDone: () => void;
}) {
	const [choice, setChoice] = useState<Choice>(null);
	// Kept while other chips are picked, so a draft survives a detour.
	const [ownText, setOwnText] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showAllHints, setShowAllHints] = useState(false);
	const composerRef = useRef<HTMLDivElement>(null);

	// Opening the panel, and anything that grows it, can push Enviar under the
	// keypad pinned to the bottom of a phone; bring the panel back into view
	// once it has its final height.
	// biome-ignore lint/correctness/useExhaustiveDependencies: choice and showAllHints change the panel's height.
	useEffect(() => {
		const timer = window.setTimeout(() => {
			composerRef.current?.scrollIntoView({
				block: "nearest",
				behavior: "smooth",
			});
		}, REVEAL_DURATION_MS);
		return () => window.clearTimeout(timer);
	}, [choice, showAllHints]);

	const visibleHints = showAllHints
		? givenHints
		: givenHints.slice(0, VISIBLE_HINT_CHIPS);
	const hiddenHintCount = givenHints.length - visibleHints.length;
	const selectedHint =
		choice?.kind === "given"
			? (givenHints.find((given) => given.text === choice.text) ?? null)
			: null;
	// Copying back the clue the asker already unlocked would tell them nothing.
	const canCopyClue = clueText != null && !request.requesterHasAiClue;

	const textToSend = (() => {
		if (choice?.kind === "copy") return clueText ?? "";
		if (choice?.kind === "given") return selectedHint?.text ?? "";
		if (choice?.kind === "own") return ownText.trim();
		return "";
	})();

	const select = (next: Choice) => {
		setChoice(next);
		setError(null);
	};

	const submit = async () => {
		if (textToSend.length === 0 || pending) return;
		setPending(true);
		setError(null);
		const result = await onRespond(request.id, textToSend);
		setPending(false);
		if (result.ok) {
			toast.success("Pista enviada!");
			onDone();
			return;
		}
		setError(reasonMessage(result.reason));
	};

	return (
		<div
			ref={composerRef}
			// Clears the keypad pinned to the bottom of a phone.
			className="flex w-full scroll-mb-[calc(var(--daily-keypad-h,0px)+1rem)] flex-col gap-2 pt-1 pb-2 lg:scroll-mb-4"
		>
			{request.requesterHasAiClue && clueText ? (
				<p className="text-xs text-muted-foreground">
					{request.requesterName} ja té la pista, prova de donar-ne una de
					diferent.
				</p>
			) : null}
			<div className="flex flex-wrap gap-1.5">
				{clueText ? (
					<ChoiceChip
						icon={Copy}
						label="Copia la pista"
						title={
							canCopyClue
								? clueText
								: `${request.requesterName} ja té aquesta pista`
						}
						selected={choice?.kind === "copy"}
						disabled={!canCopyClue}
						onSelect={() => select({ kind: "copy" })}
					/>
				) : null}
				{visibleHints.map((given) => (
					<ChoiceChip
						key={given.text}
						icon={History}
						label={given.text}
						title={given.text}
						short
						selected={choice?.kind === "given" && choice.text === given.text}
						onSelect={() => select({ kind: "given", text: given.text })}
					/>
				))}
				{hiddenHintCount > 0 ? (
					<button
						type="button"
						onClick={() => setShowAllHints(true)}
						className="flex min-h-9 items-center rounded-full px-2 text-xs font-ui text-primary hover:text-foreground lg:min-h-8"
					>
						+{hiddenHintCount} més
					</button>
				) : null}
				<ChoiceChip
					icon={Pencil}
					label="Escriu-la"
					selected={choice?.kind === "own"}
					onSelect={() => select({ kind: "own" })}
				/>
			</div>
			<Reveal open={selectedHint != null || choice?.kind === "own"}>
				{selectedHint ? <HintPreview hint={selectedHint} /> : null}
				{choice?.kind === "own" ? (
					<Textarea
						autoFocus
						value={ownText}
						maxLength={MAX_CLUE_LENGTH}
						onChange={(event) => {
							setOwnText(event.target.value);
							setError(null);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void submit();
							}
						}}
						placeholder="Escriu una pista (sense dir la paraula!)"
						className="min-h-12 rounded-sm border-border bg-background text-sm hover:border-primary/60 focus-visible:border-primary focus-visible:ring-primary/20 dark:bg-background aria-invalid:hover:border-destructive"
						aria-label={`Pista per a ${request.requesterName}`}
						aria-invalid={error != null}
					/>
				) : null}
			</Reveal>
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
			<div className="flex justify-end">
				<Button
					size="sm"
					className="gap-1.5 hover:bg-primary/85"
					onClick={() => void submit()}
					disabled={pending || textToSend.length === 0}
				>
					{pending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Send className="size-4" />
					)}
					Enviar
				</Button>
			</div>
		</div>
	);
}
