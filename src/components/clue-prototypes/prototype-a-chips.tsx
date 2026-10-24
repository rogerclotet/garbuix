import {
	Check,
	HelpingHand,
	History,
	Loader2,
	Send,
	Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CLUE_LENGTH } from "@/lib/clue-fairness";
import type { FakeRequest, FakeWord, GivenHint } from "./fake-data";
import type { CluePrototype, HelpRowsProps } from "./prototype-shared";
import {
	COMPOSER_TEXTAREA_CLASS_NAME,
	HELP_ROW_CLASS_NAME,
	reasonMessage,
} from "./prototype-shared";

// Prototype A: today's inline composer, plus one row of chips above the text
// box. A chip only fills the box, so every hint is still read and sent by hand.

const VISIBLE_HINT_CHIPS = 2;

type Suggestion = {
	id: string;
	kind: "ai" | "given";
	text: string;
	title: string;
};

function buildSuggestions(
	word: FakeWord,
	request: FakeRequest,
	givenHints: GivenHint[],
): Suggestion[] {
	const fromHints = givenHints.map((given) => ({
		id: given.id,
		kind: "given" as const,
		text: given.text,
		title: `Enviada a ${given.recipients.join(", ")}`,
	}));
	// Handing the asker the AI clue they already unlocked tells them nothing.
	if (!word.aiClue || request.requesterHasAiClue) {
		return fromHints;
	}
	return [
		{ id: "ai", kind: "ai", text: word.aiClue, title: word.aiClue },
		...fromHints,
	];
}

function SuggestionChip({
	suggestion,
	selected,
	onPick,
}: {
	suggestion: Suggestion;
	selected: boolean;
	onPick: () => void;
}) {
	const Icon = suggestion.kind === "ai" ? Sparkles : History;
	return (
		<button
			type="button"
			onClick={onPick}
			title={suggestion.title}
			aria-pressed={selected}
			className={`flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-ui transition-colors lg:min-h-8 ${
				selected
					? "border-primary bg-primary/10 text-primary"
					: "border-border bg-background text-foreground hover:border-primary/60"
			}`}
		>
			<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="truncate">
				{suggestion.kind === "ai" ? "Pista IA" : suggestion.text}
			</span>
		</button>
	);
}

function ChipComposer({
	word,
	request,
	givenHints,
	onSend,
	onDone,
}: {
	word: FakeWord;
	request: FakeRequest;
	givenHints: GivenHint[];
	onSend: HelpRowsProps["onSend"];
	onDone: () => void;
}) {
	const [text, setText] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showAllHints, setShowAllHints] = useState(false);

	const suggestions = buildSuggestions(word, request, givenHints);
	const aiSuggestions = suggestions.filter((s) => s.kind === "ai");
	const hintSuggestions = suggestions.filter((s) => s.kind === "given");
	const visibleHints = showAllHints
		? hintSuggestions
		: hintSuggestions.slice(0, VISIBLE_HINT_CHIPS);
	const hiddenHintCount = hintSuggestions.length - visibleHints.length;

	const submit = async () => {
		const trimmed = text.trim();
		if (trimmed.length === 0 || pending) return;
		setPending(true);
		setError(null);
		const result = await onSend([request.id], trimmed);
		setPending(false);
		if (result.ok) {
			onDone();
			return;
		}
		setError(reasonMessage(result.reason));
	};

	return (
		<div className="flex w-full flex-col gap-2 py-1">
			<p className="text-sm font-medium">
				Dona una pista a {request.requesterName}
			</p>
			{request.requesterHasAiClue ? (
				<p className="text-xs text-muted-foreground">
					{request.requesterName} ja té la pista IA, prova de donar-ne una de
					diferent.
				</p>
			) : null}
			{suggestions.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{[...aiSuggestions, ...visibleHints].map((suggestion) => (
						<SuggestionChip
							key={suggestion.id}
							suggestion={suggestion}
							selected={text === suggestion.text}
							onPick={() => {
								setText(suggestion.text);
								setError(null);
							}}
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
				</div>
			) : null}
			<Textarea
				autoFocus
				value={text}
				maxLength={MAX_CLUE_LENGTH}
				onChange={(event) => {
					setText(event.target.value);
					setError(null);
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						void submit();
					}
				}}
				placeholder={
					suggestions.length > 0
						? "Tria'n una de dalt o escriu-ne una"
						: "Escriu una pista (sense dir la paraula!)"
				}
				className={COMPOSER_TEXTAREA_CLASS_NAME}
				aria-label={`Pista per a ${request.requesterName}`}
				aria-invalid={error != null}
			/>
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
			<div className="flex items-center justify-end gap-2">
				<Button variant="text" size="sm" onClick={onDone} disabled={pending}>
					Ara no
				</Button>
				<Button
					size="sm"
					className="gap-1.5 hover:bg-primary/85"
					onClick={() => void submit()}
					disabled={pending || text.trim().length === 0}
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

function HelpRows({
	word,
	openRequests,
	helped,
	givenHints,
	onSend,
}: HelpRowsProps) {
	const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
	if (openRequests.length === 0 && helped.length === 0) return null;

	return (
		<div className="mt-1 flex min-w-0 flex-col pl-7">
			{openRequests.map((request) =>
				activeRequestId === request.id ? (
					<ChipComposer
						key={request.id}
						word={word}
						request={request}
						givenHints={givenHints}
						onSend={onSend}
						onDone={() => setActiveRequestId(null)}
					/>
				) : (
					<Button
						key={request.id}
						type="button"
						variant="text"
						size="sm"
						className={`${HELP_ROW_CLASS_NAME} h-auto justify-start border-0 px-0 font-normal whitespace-normal text-primary`}
						onClick={() => setActiveRequestId(request.id)}
					>
						<HelpingHand className="size-3.5" />
						Ajuda {request.requesterName}
					</Button>
				),
			)}
			{helped.map((record) => (
				<span
					key={record.requesterId}
					className={`${HELP_ROW_CLASS_NAME} text-muted-foreground`}
				>
					<Check className="size-3.5 shrink-0" />
					Has ajudat {record.requesterName}
				</span>
			))}
		</div>
	);
}

export const prototypeA: CluePrototype = {
	id: "a",
	name: "Suggeriments",
	summary:
		"El quadre d'ara, amb xips a sobre: la pista IA i les teves pistes d'avui. Una xip només omple el quadre; l'envies tu.",
	HelpRows,
	hidesAiClue: () => false,
};
