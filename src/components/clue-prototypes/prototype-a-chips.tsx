import { Collapsible } from "@base-ui/react/collapsible";
import {
	Check,
	Copy,
	HelpingHand,
	History,
	Loader2,
	type LucideIcon,
	Pencil,
	Send,
} from "lucide-react";
import {
	type ReactElement,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
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

// Prototype A: "Ajuda X" slides a panel down beneath it with one chip per way
// to help: copy the word's clue, resend one of today's hints, or write a new
// one. A chip only selects; Enviar sends. The text box exists only for "write
// a new one", so the panel stays a single row of chips until it's needed.

const VISIBLE_HINT_CHIPS = 2;

// Matches the Reveal transition, so the panel is scrolled once it has its
// final height.
const REVEAL_MS = 250;

type Choice =
	| { kind: "copy" }
	| { kind: "given"; id: string }
	| { kind: "own" }
	| null;

function Reveal({
	open,
	onOpenChange,
	trigger,
	children,
}: {
	open: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger?: ReactElement;
	children: ReactNode;
}) {
	return (
		<Collapsible.Root open={open} onOpenChange={onOpenChange}>
			{trigger ? <Collapsible.Trigger render={trigger} /> : null}
			<Collapsible.Panel className="group h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
				<div className="transition-[opacity,translate] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-ending-style:-translate-y-2 group-data-ending-style:opacity-0 group-data-starting-style:-translate-y-2 group-data-starting-style:opacity-0 motion-reduce:transition-none">
					{children}
				</div>
			</Collapsible.Panel>
		</Collapsible.Root>
	);
}

function ChoiceChip({
	icon: Icon,
	label,
	title,
	selected,
	disabled = false,
	onSelect,
}: {
	icon: LucideIcon;
	label: string;
	title?: string;
	selected: boolean;
	disabled?: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			title={title}
			aria-pressed={selected}
			disabled={disabled}
			className={`flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-ui transition-colors disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-8 ${
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
				Enviada a {formatNames(hint.recipients)} ·{" "}
				{minutesAgoLabel(hint.minutesAgo)}
			</p>
		</div>
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
	const [choice, setChoice] = useState<Choice>(null);
	// Kept while other chips are picked, so a draft survives a detour.
	const [ownText, setOwnText] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showAllHints, setShowAllHints] = useState(false);
	const composerRef = useRef<HTMLDivElement>(null);

	// Opening the panel, and any choice that grows it, can push Enviar past the
	// bottom of the screen; bring the whole panel back into view once it settles.
	// biome-ignore lint/correctness/useExhaustiveDependencies: choice changes the panel's height.
	useEffect(() => {
		const timer = window.setTimeout(() => {
			composerRef.current?.scrollIntoView({
				block: "nearest",
				behavior: "smooth",
			});
		}, REVEAL_MS);
		return () => window.clearTimeout(timer);
	}, [choice]);

	const visibleHints = showAllHints
		? givenHints
		: givenHints.slice(0, VISIBLE_HINT_CHIPS);
	const hiddenHintCount = givenHints.length - visibleHints.length;
	const selectedHint =
		choice?.kind === "given"
			? (givenHints.find((given) => given.id === choice.id) ?? null)
			: null;
	// Copying back the clue the asker already unlocked would tell them nothing.
	const canCopyClue = word.aiClue != null && !request.requesterHasAiClue;

	const textToSend = (() => {
		if (choice?.kind === "copy") return word.aiClue ?? "";
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
		const result = await onSend([request.id], textToSend);
		setPending(false);
		if (result.ok) {
			onDone();
			return;
		}
		setError(reasonMessage(result.reason));
	};

	return (
		<div
			ref={composerRef}
			// The game keypad covers the bottom of the screen on phones.
			className="flex w-full scroll-mb-[18rem] flex-col gap-2 pt-1 pb-2 lg:scroll-mb-4"
		>
			{request.requesterHasAiClue && word.aiClue ? (
				<p className="text-xs text-muted-foreground">
					{request.requesterName} ja té la pista, prova de donar-ne una de
					diferent.
				</p>
			) : null}
			<div className="flex flex-wrap gap-1.5">
				{word.aiClue ? (
					<ChoiceChip
						icon={Copy}
						label="Copia la pista"
						title={
							canCopyClue
								? word.aiClue
								: `${request.requesterName} ja té aquesta pista`
						}
						selected={choice?.kind === "copy"}
						disabled={!canCopyClue}
						onSelect={() => select({ kind: "copy" })}
					/>
				) : null}
				{visibleHints.map((given) => (
					<ChoiceChip
						key={given.id}
						icon={History}
						label={given.text}
						title={given.text}
						selected={choice?.kind === "given" && choice.id === given.id}
						onSelect={() => select({ kind: "given", id: given.id })}
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
					label="Escriu-ne una"
					selected={choice?.kind === "own"}
					onSelect={() => select({ kind: "own" })}
				/>
				{/* Shares the last row of chips when it fits, else wraps to the right. */}
				<Button
					className="ml-auto h-auto min-h-9 gap-1.5 rounded-full px-3.5 text-xs font-ui hover:bg-primary/85 lg:min-h-8"
					onClick={() => void submit()}
					disabled={pending || textToSend.length === 0}
				>
					{pending ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<Send className="size-3.5" />
					)}
					Enviar
				</Button>
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
						className={COMPOSER_TEXTAREA_CLASS_NAME}
						aria-label={`Pista per a ${request.requesterName}`}
						aria-invalid={error != null}
					/>
				) : null}
			</Reveal>
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
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
			{openRequests.map((request) => (
				<Reveal
					key={request.id}
					open={activeRequestId === request.id}
					onOpenChange={(open) => setActiveRequestId(open ? request.id : null)}
					trigger={
						<Button
							type="button"
							variant="text"
							size="sm"
							className={`${HELP_ROW_CLASS_NAME} h-auto justify-start border-0 px-0 font-normal whitespace-normal text-primary`}
						>
							<HelpingHand className="size-3.5" />
							Ajuda {request.requesterName}
						</Button>
					}
				>
					<ChipComposer
						word={word}
						request={request}
						givenHints={givenHints}
						onSend={onSend}
						onDone={() => setActiveRequestId(null)}
					/>
				</Reveal>
			))}
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
		"«Ajuda X» desplega les opcions a sota: copiar la pista de la paraula, reenviar una de les teves d'avui o escriure'n una. El quadre de text només surt amb «Escriu-ne una».",
	HelpRows,
	hidesAiClue: () => false,
};
