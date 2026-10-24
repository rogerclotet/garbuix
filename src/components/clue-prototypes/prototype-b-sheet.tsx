import { Drawer } from "@base-ui/react/drawer";
import {
	Check,
	HelpingHand,
	History,
	Loader2,
	Pencil,
	Send,
	Sparkles,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
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

// Prototype B: "Ajuda X" opens a bottom sheet listing every source side by
// side: your hints from today, the AI clue, and a box to write your own. You
// pick one card and send it. The list has room for context (who got which
// hint, whether the asker already has the AI clue) without stretching the
// word list.

type Choice = { kind: "given"; id: string } | { kind: "ai" } | { kind: "own" };

function initialChoice(
	word: FakeWord,
	request: FakeRequest,
	givenHints: GivenHint[],
): Choice {
	const newest = givenHints[0];
	if (newest) return { kind: "given", id: newest.id };
	if (word.aiClue && !request.requesterHasAiClue) return { kind: "ai" };
	return { kind: "own" };
}

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<h4 className="mt-4 mb-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground font-ui first:mt-0">
			{children}
		</h4>
	);
}

function OptionCard({
	selected,
	disabled = false,
	icon,
	text,
	meta,
	onSelect,
	onEdit,
}: {
	selected: boolean;
	disabled?: boolean;
	icon: ReactNode;
	text: string;
	meta: ReactNode | null;
	onSelect: () => void;
	onEdit?: () => void;
}) {
	return (
		<div
			className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${
				disabled
					? "border-border/60 opacity-60"
					: selected
						? "border-primary bg-primary/5"
						: "border-border hover:border-primary/60"
			}`}
		>
			<label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-left has-disabled:cursor-not-allowed">
				<input
					type="radio"
					name="hint-choice"
					checked={selected}
					disabled={disabled}
					onChange={onSelect}
					className="peer sr-only"
				/>
				<span
					aria-hidden="true"
					className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 ${
						selected
							? "border-primary bg-primary"
							: "border-muted-foreground/50"
					}`}
				>
					{selected ? (
						<span className="size-1.5 rounded-full bg-primary-foreground" />
					) : null}
				</span>
				<span className="flex min-w-0 flex-col gap-1">
					<span className="text-sm leading-snug wrap-anywhere">{text}</span>
					{meta ? (
						<span className="flex items-center gap-1 text-xs text-muted-foreground font-ui">
							{icon}
							{meta}
						</span>
					) : null}
				</span>
			</label>
			{onEdit && !disabled ? (
				<Button
					type="button"
					variant="text"
					size="icon-sm"
					className="-mt-1 -mr-1 size-9 shrink-0 text-muted-foreground hover:text-primary"
					aria-label="Edita aquesta pista"
					title="Edita-la abans d'enviar-la"
					onClick={onEdit}
				>
					<Pencil className="size-3.5" />
				</Button>
			) : null}
		</div>
	);
}

function HintPicker({
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
	const [choice, setChoice] = useState<Choice>(() =>
		initialChoice(word, request, givenHints),
	);
	const [ownText, setOwnText] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ownTextRef = useRef<HTMLTextAreaElement>(null);

	const chosenText = (() => {
		if (choice.kind === "own") return ownText.trim();
		if (choice.kind === "ai") return word.aiClue ?? "";
		return givenHints.find((given) => given.id === choice.id)?.text ?? "";
	})();

	const pick = (next: Choice) => {
		setChoice(next);
		setError(null);
	};

	const editIntoOwn = (text: string) => {
		setOwnText(text);
		pick({ kind: "own" });
		window.requestAnimationFrame(() => {
			const field = ownTextRef.current;
			field?.focus();
			field?.setSelectionRange(text.length, text.length);
		});
	};

	const submit = async () => {
		if (chosenText.length === 0 || pending) return;
		setPending(true);
		setError(null);
		const result = await onSend([request.id], chosenText);
		setPending(false);
		if (result.ok) {
			onDone();
			return;
		}
		setError(reasonMessage(result.reason));
	};

	return (
		<>
			<Drawer.Content className="mx-auto flex w-full max-w-lg flex-col">
				<Drawer.Title className="text-lg font-bold">
					Dona una pista a {request.requesterName}
				</Drawer.Title>
				<Drawer.Description className="mb-4 text-sm text-muted-foreground font-ui">
					<span className="font-semibold tracking-wider text-foreground">
						{word.answer.toUpperCase()}
					</span>{" "}
					· {word.answer.length} lletres
				</Drawer.Description>

				<fieldset className="min-w-0">
					<legend className="sr-only">Pista a enviar</legend>
					{givenHints.length > 0 ? (
						<>
							<SectionLabel>Les teves pistes d'avui</SectionLabel>
							<div className="flex flex-col gap-2">
								{givenHints.map((given) => (
									<OptionCard
										key={given.id}
										selected={choice.kind === "given" && choice.id === given.id}
										icon={<History className="size-3" aria-hidden="true" />}
										text={given.text}
										meta={`A ${formatNames(given.recipients)} · ${minutesAgoLabel(given.minutesAgo)}`}
										onSelect={() => pick({ kind: "given", id: given.id })}
										onEdit={() => editIntoOwn(given.text)}
									/>
								))}
							</div>
						</>
					) : null}

					{word.aiClue ? (
						<>
							<SectionLabel>Pista IA</SectionLabel>
							<OptionCard
								selected={choice.kind === "ai"}
								disabled={request.requesterHasAiClue}
								icon={<Sparkles className="size-3" aria-hidden="true" />}
								text={word.aiClue}
								meta={
									request.requesterHasAiClue
										? `${request.requesterName} ja la té`
										: null
								}
								onSelect={() => pick({ kind: "ai" })}
								onEdit={() => editIntoOwn(word.aiClue ?? "")}
							/>
						</>
					) : null}

					<SectionLabel>O escriu-ne una</SectionLabel>
					<Textarea
						ref={ownTextRef}
						value={ownText}
						maxLength={MAX_CLUE_LENGTH}
						onFocus={() => pick({ kind: "own" })}
						onChange={(event) => {
							setOwnText(event.target.value);
							setError(null);
						}}
						placeholder="Escriu una pista (sense dir la paraula!)"
						className={`${COMPOSER_TEXTAREA_CLASS_NAME} ${
							choice.kind === "own" ? "border-primary" : ""
						}`}
						aria-label={`Pista pròpia per a ${request.requesterName}`}
						aria-invalid={error != null && choice.kind === "own"}
					/>
				</fieldset>
				{error ? (
					<p className="mt-2 text-xs text-destructive">{error}</p>
				) : null}
			</Drawer.Content>

			<div className="mx-auto mt-4 flex w-full max-w-lg items-center justify-end gap-2">
				<Drawer.Close
					render={
						<Button variant="text" disabled={pending}>
							Ara no
						</Button>
					}
				/>
				<Button
					size="lg"
					className="min-w-28 gap-1.5 hover:bg-primary/85"
					onClick={() => void submit()}
					disabled={pending || chosenText.length === 0}
				>
					{pending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Send className="size-4" />
					)}
					Enviar
				</Button>
			</div>
		</>
	);
}

function HintSheet({
	open,
	onOpenChange,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}) {
	return (
		<Drawer.Root open={open} onOpenChange={onOpenChange}>
			<Drawer.VirtualKeyboardProvider>
				<Drawer.Portal>
					<Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black opacity-[calc(0.4*(1-var(--drawer-swipe-progress)))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] supports-[-webkit-touch-callout:none]:absolute dark:opacity-[calc(0.7*(1-var(--drawer-swipe-progress)))]" />
					<Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
						<Drawer.Popup className="-mb-12 max-h-[calc(85dvh+3rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-background px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px)+3rem)] text-foreground shadow-xl outline-none touch-auto [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-ending-style:[transform:translateY(calc(100%-3rem+2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] sm:border-x">
							<div className="mx-auto mb-4 h-1 w-12 rounded-full bg-muted-foreground/30" />
							{children}
						</Drawer.Popup>
					</Drawer.Viewport>
				</Drawer.Portal>
			</Drawer.VirtualKeyboardProvider>
		</Drawer.Root>
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
	// Kept after close so the sheet's exit animation still has content to show.
	const [shownRequest, setShownRequest] = useState<FakeRequest | null>(null);
	if (openRequests.length === 0 && helped.length === 0) return null;

	const open = (request: FakeRequest) => {
		setShownRequest(request);
		setActiveRequestId(request.id);
	};

	return (
		<div className="mt-1 flex min-w-0 flex-col pl-7">
			{openRequests.map((request) => (
				<Button
					key={request.id}
					type="button"
					variant="text"
					size="sm"
					className={`${HELP_ROW_CLASS_NAME} h-auto justify-start border-0 px-0 font-normal whitespace-normal text-primary`}
					onClick={() => open(request)}
				>
					<HelpingHand className="size-3.5" />
					Ajuda {request.requesterName}
				</Button>
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
			<HintSheet
				open={activeRequestId !== null}
				onOpenChange={(next) => {
					if (!next) setActiveRequestId(null);
				}}
			>
				{shownRequest ? (
					<HintPicker
						key={shownRequest.id}
						word={word}
						request={shownRequest}
						givenHints={givenHints}
						onSend={onSend}
						onDone={() => setActiveRequestId(null)}
					/>
				) : null}
			</HintSheet>
		</div>
	);
}

export const prototypeB: CluePrototype = {
	id: "b",
	name: "Full de tria",
	summary:
		"«Ajuda X» obre un full des de baix amb totes les opcions en targetes: les teves pistes d'avui, la IA i un quadre per escriure'n una. En tries una i l'envies.",
	HelpRows,
	hidesAiClue: () => false,
};
