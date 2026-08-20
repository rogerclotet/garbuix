import {
	Check,
	ClipboardCopy,
	ExternalLink,
	HelpingHand,
	Loader2,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClueResponder } from "@/components/clue/clue-responder";
import { Button } from "@/components/ui/button";
import type {
	ClueHelpGiven,
	ClueRequest,
	ClueResponse,
} from "@/lib/clue-request-types";
import { clueHelpGivenField, wordRowId } from "@/lib/clue-request-types";
import type {
	DailyPuzzlePublic,
	DailyPuzzleWordSlot,
} from "@/lib/puzzle-types";
import type { RespondResult } from "@/lib/use-clue-requests";
import { cn } from "@/lib/utils";
import {
	getDisplayedSlotWord,
	getOptimotDefinitionUrl,
	getSortedWordSlots,
	getWordTone,
	type WordTone,
} from "./daily-helpers";

// Redesigned word list: a horizontal rail of pills, one per word, plus a panel
// that opens above it for the selected word. A pill can hold a pattern and a
// length; it cannot hold a sentence, so clues — and the peer-help exchange —
// live in the panel, which hands its height back to the board when closed.

// Every surface a word owns — closed pill, selected pill, panel — is a shade of
// the one colour its tone picks, so selecting a word never swaps its identity
// for a generic highlight.
const PILL_CLASSES: Record<WordTone, { open: string; closed: string }> = {
	found: {
		open: "bg-primary/25 text-foreground",
		closed: "bg-primary/12 text-primary",
	},
	social: {
		open: "bg-game-social/32 text-game-social-strong",
		closed: "bg-game-social/14 text-game-social-strong",
	},
	clue: {
		open: "bg-game-clue/32 text-game-clue-strong",
		closed: "bg-game-clue/14 text-game-clue-strong",
	},
	plain: {
		open: "bg-secondary text-foreground",
		closed: "bg-muted/70 text-muted-foreground",
	},
};

const PANEL_ACCENT_CLASSES: Record<WordTone, string> = {
	found: "bg-primary/12",
	social: "bg-game-social/18",
	clue: "bg-game-clue/22",
	plain: "bg-muted",
};

const PANEL_TEXT_CLASSES: Record<WordTone, string> = {
	found: "text-muted-foreground",
	social: "text-game-social-strong",
	clue: "text-game-clue-strong",
	plain: "text-muted-foreground",
};

const PANEL_CHIP_CLASSES: Record<WordTone, string> = {
	found: "text-primary",
	social: "text-game-social-strong",
	clue: "text-game-clue-strong",
	plain: "text-muted-foreground",
};

type DailyWordRailProps = {
	puzzle: DailyPuzzlePublic;
	guessedWordIds: number[];
	revealedAnswers: Record<number, string>;
	cellLetters: Map<string, string>;
	clueTextsByWordId?: Record<number, string>;
	foundClueTextsByWordId?: Record<number, string>;
	canRequestHelp?: boolean;
	requestedHelpWordIds?: number[];
	peerCluesByWordId?: Record<number, ClueResponse>;
	onRequestHelp?: (wordId: number) => void;
	incomingRequests?: ClueRequest[];
	helpGivenRecords?: ClueHelpGiven[];
	onRespondToClue?: (requestId: string, text: string) => Promise<RespondResult>;
	// The open word lives in the parent so the board can mark its cells.
	openWordId: number | null;
	onOpenWordChange: (wordId: number | null) => void;
};

export function DailyWordRail({
	puzzle,
	guessedWordIds,
	revealedAnswers,
	cellLetters,
	clueTextsByWordId = {},
	foundClueTextsByWordId = {},
	canRequestHelp = false,
	requestedHelpWordIds = [],
	peerCluesByWordId = {},
	onRequestHelp,
	incomingRequests = [],
	helpGivenRecords = [],
	onRespondToClue,
	openWordId,
	onOpenWordChange,
}: DailyWordRailProps) {
	const { foundSlots, notFoundSlots } = getSortedWordSlots(
		puzzle.wordSlots,
		guessedWordIds,
		cellLetters,
	);
	const foundWordIds = new Set(guessedWordIds);
	const requestedHelp = new Set(requestedHelpWordIds);

	// One row per asker, and only for words this player has found — you can't
	// give a useful clue for a word you haven't solved yourself.
	const requestsByWordId = new Map<number, ClueRequest[]>();
	for (const request of incomingRequests) {
		if (!foundWordIds.has(request.wordId)) continue;
		const existing = requestsByWordId.get(request.wordId);
		if (existing) {
			if (existing.some((entry) => entry.requesterId === request.requesterId)) {
				continue;
			}
			existing.push(request);
		} else {
			requestsByWordId.set(request.wordId, [request]);
		}
	}

	const helpedKeys = new Set(
		helpGivenRecords.map((record) =>
			clueHelpGivenField(record.requesterId, record.wordId),
		),
	);

	const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
	const [prefillText, setPrefillText] = useState("");
	const composerNonceRef = useRef(0);
	const pillRefs = useRef(new Map<number, HTMLButtonElement>());
	const seenClueIdsRef = useRef(new Set<number>());

	const openSlot =
		puzzle.wordSlots.find((slot) => slot.id === openWordId) ?? null;

	// A clue arriving — from the hint button or from another player — opens its
	// own panel, so a clue is never delivered into a closed drawer.
	const cluedKey = [
		...Object.keys(clueTextsByWordId),
		...Object.keys(peerCluesByWordId),
	]
		.map(Number)
		.filter((wordId) => !foundWordIds.has(wordId))
		.sort((left, right) => left - right)
		.join(",");

	useEffect(() => {
		if (cluedKey === "") return;
		const ids = cluedKey.split(",").map(Number);
		const unseen = ids.find((id) => !seenClueIdsRef.current.has(id));
		for (const id of ids) seenClueIdsRef.current.add(id);
		if (unseen == null) return;
		onOpenWordChange(unseen);
	}, [cluedKey, onOpenWordChange]);

	// The open word's pill can be scrolled out of the rail, which would leave the
	// panel pointing at nothing visible.
	useLayoutEffect(() => {
		if (openWordId == null) return;
		pillRefs.current.get(openWordId)?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
			inline: "center",
		});
	}, [openWordId]);

	const closeComposer = () => {
		setActiveRequestId(null);
		setPrefillText("");
	};

	const openComposer = (requestId: string, initial: string) => {
		composerNonceRef.current += 1;
		setPrefillText(initial);
		setActiveRequestId(requestId);
	};

	const togglePill = (wordId: number) => {
		closeComposer();
		onOpenWordChange(openWordId === wordId ? null : wordId);
	};

	const renderPill = (slot: DailyPuzzleWordSlot, isFound: boolean) => {
		const clueText = clueTextsByWordId[slot.id];
		const peerClue = peerCluesByWordId[slot.id];
		const hasIncoming = requestsByWordId.has(slot.id);
		const isOpen = slot.id === openWordId;
		const tone = getWordTone({
			isFound,
			hasPeerHelp: hasIncoming || Boolean(peerClue),
			hasClue: Boolean(clueText),
		});

		return (
			<button
				type="button"
				key={slot.id}
				id={wordRowId(slot.id)}
				ref={(element) => {
					if (element) pillRefs.current.set(slot.id, element);
					else pillRefs.current.delete(slot.id);
				}}
				onClick={() => togglePill(slot.id)}
				className={cn(
					"flex h-8 shrink-0 scroll-mx-3 items-center gap-1.5 rounded-full pr-2 pl-2.5 transition-colors duration-200 motion-reduce:transition-none",
					isOpen ? PILL_CLASSES[tone].open : PILL_CLASSES[tone].closed,
				)}
			>
				{isFound ? <Check className="size-3" /> : null}
				<span
					className={cn(
						"text-xs",
						isFound
							? "font-semibold tracking-[0.12em]"
							: "font-mono tracking-[0.2em]",
					)}
				>
					{isFound
						? revealedAnswers[slot.id]?.toUpperCase()
						: getDisplayedSlotWord(slot, cellLetters).replaceAll("_", "·")}
				</span>
				{!isFound && clueText ? <Sparkles className="size-3" /> : null}
				{hasIncoming || (!isFound && peerClue) ? (
					<HelpingHand className="size-3" />
				) : null}
				{isFound ? null : (
					<span className="rounded-full bg-background/70 px-1.5 text-[10px] font-bold tabular-nums font-ui">
						{slot.length}
					</span>
				)}
			</button>
		);
	};

	const openIsFound = openSlot != null && foundWordIds.has(openSlot.id);
	const openRequests = openSlot
		? (requestsByWordId.get(openSlot.id) ?? [])
		: [];
	const openPeerClue = openSlot ? peerCluesByWordId[openSlot.id] : undefined;
	const openClueText = openSlot
		? (clueTextsByWordId[openSlot.id] ?? foundClueTextsByWordId[openSlot.id])
		: undefined;
	// Derived exactly like the pill's, so opening a word never recolours it.
	const openTone = getWordTone({
		isFound: openIsFound,
		hasPeerHelp: openRequests.length > 0 || Boolean(openPeerClue),
		hasClue: Boolean(openClueText),
	});

	return (
		<div className="shrink-0">
			<WordPanel
				slot={openSlot}
				tone={openTone}
				isFound={openIsFound}
				displayedWord={
					openSlot
						? getDisplayedSlotWord(openSlot, cellLetters).replaceAll("_", "·")
						: ""
				}
				revealedAnswer={openSlot ? revealedAnswers[openSlot.id] : undefined}
				clueText={openClueText}
				peerClue={openPeerClue}
				canRequestHelp={canRequestHelp}
				isWaitingForHelp={
					openSlot != null &&
					requestedHelp.has(openSlot.id) &&
					!peerCluesByWordId[openSlot.id]
				}
				onRequestHelp={onRequestHelp}
				requests={openRequests}
				helpedKeys={helpedKeys}
				helpGivenRecords={helpGivenRecords}
				activeRequestId={activeRequestId}
				prefillText={prefillText}
				composerNonce={composerNonceRef.current}
				onOpenComposer={openComposer}
				onCloseComposer={closeComposer}
				onRespondToClue={onRespondToClue}
				onClose={() => {
					closeComposer();
					onOpenWordChange(null);
				}}
			/>

			<div className="flex gap-1.5 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{notFoundSlots.map((slot) => renderPill(slot, false))}
				{foundSlots.map((slot) => renderPill(slot, true))}
			</div>
		</div>
	);
}

function WordPanel({
	slot,
	tone,
	isFound,
	displayedWord,
	revealedAnswer,
	clueText,
	peerClue,
	canRequestHelp,
	isWaitingForHelp,
	onRequestHelp,
	requests,
	helpedKeys,
	helpGivenRecords,
	activeRequestId,
	prefillText,
	composerNonce,
	onOpenComposer,
	onCloseComposer,
	onRespondToClue,
	onClose,
}: {
	slot: DailyPuzzleWordSlot | null;
	tone: WordTone;
	isFound: boolean;
	displayedWord: string;
	revealedAnswer: string | undefined;
	clueText: string | undefined;
	peerClue: ClueResponse | undefined;
	canRequestHelp: boolean;
	isWaitingForHelp: boolean;
	onRequestHelp?: (wordId: number) => void;
	requests: ClueRequest[];
	helpedKeys: Set<string>;
	helpGivenRecords: ClueHelpGiven[];
	activeRequestId: string | null;
	prefillText: string;
	composerNonce: number;
	onOpenComposer: (requestId: string, initial: string) => void;
	onCloseComposer: () => void;
	onRespondToClue?: (requestId: string, text: string) => Promise<RespondResult>;
	onClose: () => void;
}) {
	const open = slot != null;
	const clueRef = useRef<HTMLDivElement | null>(null);
	const [clueOverflows, setClueOverflows] = useState(false);
	const text = clueText ?? peerClue?.text ?? "";
	const isPeer = !clueText && Boolean(peerClue);
	const hasClue = text.length > 0;
	const activeRequest =
		requests.find((request) => request.id === activeRequestId) ?? null;

	// Fade the last line only when the clue actually runs past three lines, so a
	// short clue is never dimmed for no reason.
	useLayoutEffect(() => {
		const element = clueRef.current;
		if (!element || text.length === 0) {
			setClueOverflows(false);
			return;
		}
		setClueOverflows(element.scrollHeight > element.clientHeight + 1);
	}, [text]);

	const helpedWithoutOpenRequest = slot
		? helpGivenRecords.filter(
				(record) =>
					record.wordId === slot.id &&
					!requests.some(
						(request) => request.requesterId === record.requesterId,
					),
			)
		: [];

	const optimotUrl =
		isFound && revealedAnswer ? getOptimotDefinitionUrl(revealedAnswer) : null;

	return (
		<div
			aria-hidden={!open}
			className={cn(
				"grid px-3 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
				open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
			)}
		>
			{/* min-h-0 lets the row actually collapse to 0fr. */}
			<div className="min-h-0 overflow-hidden">
				<div
					className={cn(
						"my-1.5 flex gap-2 rounded-2xl px-2.5 py-2 transition-opacity duration-200 ease-out motion-reduce:transition-none",
						open ? "opacity-100" : "opacity-0",
						// A clue can run to three lines, so its row hangs from the top; the
						// single-line state centres instead of floating above the space.
						hasClue || requests.length > 0 || isFound
							? "items-start"
							: "min-h-11 items-center",
						PANEL_ACCENT_CLASSES[tone],
					)}
				>
					{slot ? (
						<>
							<WordChip
								tone={tone}
								isFound={isFound}
								label={
									isFound
										? (revealedAnswer?.toUpperCase() ?? "")
										: displayedWord
								}
								optimotUrl={optimotUrl}
								optimotLabel={
									revealedAnswer
										? `Definició de ${revealedAnswer} a Optimot`
										: undefined
								}
							/>

							<div className="flex min-w-0 flex-1 flex-col gap-1.5">
								{hasClue ? (
									// The whole clue, capped at three lines; longer ones scroll
									// inside the panel rather than being cut off.
									<div
										ref={clueRef}
										className={cn(
											"max-h-15 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
											clueOverflows &&
												"[mask-image:linear-gradient(to_bottom,black_calc(100%-0.9rem),transparent)]",
										)}
									>
										<p
											className={cn(
												"text-[13px] italic leading-5 font-ui",
												PANEL_TEXT_CLASSES[tone],
											)}
										>
											{text}
											{isPeer ? (
												<span className="ml-1 text-[11px] not-italic opacity-70">
													— {peerClue?.responderName}
												</span>
											) : null}
										</p>
									</div>
								) : null}

								{optimotUrl ? (
									<a
										href={optimotUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex w-fit items-center gap-1 text-[12px] font-bold text-primary font-ui hover:underline"
									>
										<ExternalLink className="size-3" />
										Veure definició a Optimot
									</a>
								) : null}

								{!isFound && !hasClue ? (
									<div className="flex items-center gap-2">
										<span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground/80 font-ui">
											{slot.length} lletres
										</span>
										{canRequestHelp ? (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												disabled={isWaitingForHelp}
												onClick={() => onRequestHelp?.(slot.id)}
												className="h-6 gap-1 rounded-full bg-game-social/14 px-2 text-[11px] font-bold text-game-social-strong font-ui hover:bg-game-social/20 hover:text-game-social-strong"
											>
												{isWaitingForHelp ? (
													<Loader2 className="size-3 animate-spin" />
												) : (
													<HelpingHand className="size-3" />
												)}
												{isWaitingForHelp ? "Esperant…" : "Ajuda"}
											</Button>
										) : null}
									</div>
								) : null}

								{/* The other side of the exchange: friends waiting on a clue
								    for a word this player has already solved. */}
								{requests.map((request) => {
									const helpedKey = clueHelpGivenField(
										request.requesterId,
										request.wordId,
									);
									if (helpedKeys.has(helpedKey)) {
										return (
											<span
												key={helpedKey}
												className="flex items-center gap-1.5 text-sm text-primary font-ui"
											>
												<Check className="size-3.5 shrink-0" />
												Has ajudat a {request.requesterName}
											</span>
										);
									}

									if (activeRequest?.id === request.id) {
										return (
											<div
												key={`${request.id}:${composerNonce}`}
												className="flex flex-col gap-1.5"
											>
												<ClueResponder
													request={request}
													onRespond={(requestId, responseText) =>
														onRespondToClue
															? onRespondToClue(requestId, responseText)
															: Promise.resolve({ ok: false, reason: null })
													}
													onDone={onCloseComposer}
													intro={`Dóna una pista a ${request.requesterName}`}
													initialText={prefillText}
												/>
												{clueText ? (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="h-7 w-fit gap-1.5 px-2 text-xs text-muted-foreground font-ui"
														onClick={() => onOpenComposer(request.id, clueText)}
													>
														<ClipboardCopy className="size-3.5" />
														Fes servir la pista de la IA
													</Button>
												) : null}
											</div>
										);
									}

									return (
										<Button
											key={request.id}
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 w-fit gap-1.5 px-2 text-xs text-game-social-strong font-ui hover:text-game-social-strong"
											onClick={() => onOpenComposer(request.id, "")}
											disabled={!onRespondToClue}
										>
											<HelpingHand className="size-3.5" />
											Ajuda {request.requesterName}
										</Button>
									);
								})}

								{helpedWithoutOpenRequest.map((record) => (
									<span
										key={clueHelpGivenField(record.requesterId, record.wordId)}
										className="flex items-center gap-1.5 text-sm text-primary font-ui"
									>
										<Check className="size-3.5 shrink-0" />
										Has ajudat a {record.requesterName}
									</span>
								))}
							</div>

							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={onClose}
								aria-label="Tanca el plafó"
								className="-mr-1 size-6 shrink-0 rounded-full text-muted-foreground"
							>
								<X className="size-3.5" />
							</Button>
						</>
					) : null}
				</div>
			</div>
		</div>
	);
}

// Just the word: the pill right below already carries this word's icon, so
// repeating it here only crowds the panel.
function WordChip({
	tone,
	isFound,
	label,
	optimotUrl,
	optimotLabel,
}: {
	tone: WordTone;
	isFound: boolean;
	label: string;
	optimotUrl: string | null;
	optimotLabel?: string;
}) {
	const className = cn(
		"flex h-6 shrink-0 items-center rounded-full bg-background/70 px-2",
		PANEL_CHIP_CLASSES[tone],
		isFound ? "hover:underline" : null,
	);
	const inner = (
		<span
			className={cn(
				"text-[11px]",
				isFound
					? "font-semibold tracking-[0.12em]"
					: "font-mono tracking-[0.16em]",
			)}
		>
			{label}
		</span>
	);

	if (optimotUrl) {
		return (
			<a
				href={optimotUrl}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={optimotLabel}
				className={className}
			>
				{inner}
			</a>
		);
	}

	return <span className={className}>{inner}</span>;
}
