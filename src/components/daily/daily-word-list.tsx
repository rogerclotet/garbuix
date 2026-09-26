import {
	Check,
	Circle,
	ClipboardCopy,
	Clock3,
	HelpingHand,
	Info,
	Sparkles,
	Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { ClueResponder } from "@/components/clue/clue-responder";
import { Button } from "@/components/ui/button";
import type {
	ClueHelpGiven,
	ClueRequest,
	ClueResponse,
} from "@/lib/clue-request-types";
import { clueHelpGivenField, wordRowId } from "@/lib/clue-request-types";
import type { PuzzleWordSlot } from "@/lib/puzzle-types";
import type { RespondResult } from "@/lib/use-clue-requests";
import {
	getDisplayedSlotWord,
	getOptimotDefinitionUrl,
	getSortedWordSlots,
} from "./daily-helpers";

type DailyWordListProps = {
	puzzle: { wordSlots: PuzzleWordSlot[] };
	idPrefix?: string;
	guessedWordIds: number[];
	revealedAnswers: Record<number, string>;
	cellLetters: Map<string, string>;
	clueTextsByWordId?: Record<number, string>;
	clueWordIds?: number[];
	foundClueTextsByWordId?: Record<number, string>;
	onWordTap?: (wordId: number) => void;
	// Peer clue requests: when out of hints, let the player ask other players for
	// help on a specific unfound word.
	canRequestHelp?: boolean;
	requestedHelpWordIds?: number[];
	peerCluesByWordId?: Record<number, ClueResponse>;
	onRequestHelp?: (wordId: number) => void;
	// The other side: requests from other players this user can help with.
	incomingRequests?: ClueRequest[];
	helpGivenRecords?: ClueHelpGiven[];
	onRespondToClue?: (requestId: string, text: string) => Promise<RespondResult>;
};

export function DailyWordList({
	puzzle,
	idPrefix = "",
	guessedWordIds,
	revealedAnswers,
	cellLetters,
	clueTextsByWordId = {},
	clueWordIds = [],
	foundClueTextsByWordId = {},
	onWordTap,
	canRequestHelp = false,
	requestedHelpWordIds = [],
	peerCluesByWordId = {},
	onRequestHelp,
	incomingRequests = [],
	helpGivenRecords = [],
	onRespondToClue,
}: DailyWordListProps) {
	const { foundSlots, notFoundSlots } = getSortedWordSlots(
		puzzle.wordSlots,
		guessedWordIds,
		cellLetters,
	);
	const cluedWordIds = new Set(clueWordIds);
	const requestedHelp = new Set(requestedHelpWordIds);
	const foundWordIds = new Set(guessedWordIds);

	const requestsByWordId = new Map<number, ClueRequest[]>();
	for (const request of incomingRequests) {
		// You can only give a useful clue for a word you've found yourself, so
		// don't surface help requests for words still unsolved on your board.
		if (!foundWordIds.has(request.wordId)) continue;
		const existing = requestsByWordId.get(request.wordId);
		if (existing) {
			// One row per asker: skip a friend already listed for this word.
			if (existing.some((r) => r.requesterId === request.requesterId)) continue;
			existing.push(request);
		} else {
			requestsByWordId.set(request.wordId, [request]);
		}
	}

	// Which request's composer is currently expanded (one at a time keeps the
	// list compact), plus the text it should open with. The nonce forces the
	// composer to remount when text is dropped in via the copy button.
	const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
	const [prefillText, setPrefillText] = useState("");
	const composerNonceRef = useRef(0);

	const helpedKeys = new Set(
		helpGivenRecords.map((record) =>
			clueHelpGivenField(record.requesterId, record.wordId),
		),
	);

	const needsHelpWordIds = new Set(
		incomingRequests
			.filter(
				(request) =>
					onRespondToClue &&
					!helpedKeys.has(
						clueHelpGivenField(request.requesterId, request.wordId),
					),
			)
			.map((request) => request.wordId),
	);
	const needsHelpSlots = foundSlots.filter((slot) =>
		needsHelpWordIds.has(slot.id),
	);
	const otherFoundSlots = foundSlots.filter(
		(slot) => !needsHelpWordIds.has(slot.id),
	);

	const respondAndRecord = (
		requestId: string,
		text: string,
	): Promise<RespondResult> => {
		if (!onRespondToClue) return Promise.resolve({ ok: false, reason: null });
		return onRespondToClue(requestId, text);
	};

	const openComposer = (requestId: string, initial: string) => {
		composerNonceRef.current += 1;
		setPrefillText(initial);
		setActiveRequestId(requestId);
	};

	const closeComposer = () => {
		setActiveRequestId(null);
		setPrefillText("");
	};

	// True while a response composer for one of this word's requests is open —
	// the only time it makes sense to copy the word's AI clue into a reply.
	const isComposingForWord = (wordId: number): boolean => {
		if (activeRequestId === null) return false;
		const requests = requestsByWordId.get(wordId);
		return Boolean(requests?.some((request) => request.id === activeRequestId));
	};

	// Drop the word's AI clue into the composer that's currently open for it.
	const handleUseClue = (wordId: number, clueText: string) => {
		const requests = requestsByWordId.get(wordId);
		const target =
			requests?.find((request) => request.id === activeRequestId) ??
			requests?.[0];
		if (!target) return;
		openComposer(target.id, clueText);
	};

	const renderIncomingRequests = (wordId: number) => {
		const requests = requestsByWordId.get(wordId);
		if (!requests || requests.length === 0 || !onRespondToClue) {
			return null;
		}

		return (
			<div className="flex min-w-0 flex-col gap-2 pl-7">
				{requests.map((request) => {
					const helpedKey = clueHelpGivenField(
						request.requesterId,
						request.wordId,
					);
					if (helpedKeys.has(helpedKey)) {
						return (
							<span
								key={helpedKey}
								className="flex items-center gap-1.5 text-sm font-ui text-primary"
							>
								<Check className="size-3.5 shrink-0" />
								Has ajudat a {request.requesterName}
							</span>
						);
					}
					return activeRequestId === request.id ? (
						<ClueResponder
							key={`${request.id}:${composerNonceRef.current}`}
							request={request}
							onRespond={(requestId, text) => respondAndRecord(requestId, text)}
							onDone={closeComposer}
							intro={`Dóna una pista a ${request.requesterName}`}
							initialText={prefillText}
						/>
					) : (
						<Button
							key={request.id}
							type="button"
							variant="ghost"
							size="sm"
							className="h-auto min-h-11 max-w-full w-fit justify-start gap-1.5 px-0 py-2 text-left text-xs whitespace-normal font-ui text-primary hover:bg-transparent hover:text-primary hover:underline lg:min-h-9"
							onClick={() => openComposer(request.id, "")}
						>
							<HelpingHand className="size-3.5" />
							Ajuda {request.requesterName}
						</Button>
					);
				})}
			</div>
		);
	};

	const renderHelpedConfirmation = (wordId: number) => {
		const helpedForWord = helpGivenRecords.filter(
			(record) => record.wordId === wordId,
		);
		const requests = requestsByWordId.get(wordId) ?? [];
		const helpedWithoutOpenRequest = helpedForWord.filter(
			(record) =>
				!requests.some((request) => request.requesterId === record.requesterId),
		);
		if (helpedWithoutOpenRequest.length === 0) return null;
		return (
			<div className="flex min-w-0 flex-col gap-1.5 pl-7">
				{helpedWithoutOpenRequest.map((record) => (
					<span
						key={clueHelpGivenField(record.requesterId, record.wordId)}
						className="flex items-center gap-1.5 text-sm font-ui text-primary"
					>
						<Check className="size-3.5 shrink-0" />
						Has ajudat a {record.requesterName}
					</span>
				))}
			</div>
		);
	};

	// An AI clue shown next to a word can be copied into the response composer,
	// but only while a composer for that word is actually open.
	const renderClueLine = (
		wordId: number,
		clueText: string,
		tone: "muted" | "foreground",
	) => (
		<div className="flex min-w-0 items-start gap-1 pl-7">
			<span
				className={`block min-w-0 flex-1 text-sm leading-relaxed wrap-anywhere font-ui ${
					tone === "foreground" ? "text-foreground" : "text-muted-foreground"
				}`}
			>
				{clueText}
			</span>
			{isComposingForWord(wordId) && onRespondToClue ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-11 shrink-0 text-muted-foreground hover:text-foreground lg:size-9"
					aria-label="Fes servir aquesta pista"
					title="Fes servir aquesta pista"
					onClick={() => handleUseClue(wordId, clueText)}
				>
					<ClipboardCopy className="size-3.5" />
				</Button>
			) : null}
		</div>
	);

	const renderFoundSlot = (slot: PuzzleWordSlot) => {
		const foundClueText = foundClueTextsByWordId[slot.id];

		return (
			<div
				key={slot.id}
				id={`${idPrefix}${wordRowId(slot.id)}`}
				className="flex min-w-0 flex-col gap-1 border-b border-border/60 py-2 pl-2 scroll-mt-4"
			>
				<div className="flex min-h-11 items-center gap-2">
					<Check className="size-5 shrink-0 text-primary" aria-hidden="true" />
					<span className="min-w-0 font-semibold text-foreground tracking-wider wrap-anywhere">
						{revealedAnswers[slot.id]?.toUpperCase()}
					</span>
					<a
						href={getOptimotDefinitionUrl(revealedAnswers[slot.id] ?? "")}
						target="_blank"
						rel="noopener noreferrer"
						className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:size-9"
						aria-label={`Consulta la definició de ${revealedAnswers[slot.id]?.toUpperCase() ?? ""} a l'Optimot`}
						title="Consulta la definició a l'Optimot"
					>
						<Info className="size-4" />
					</a>
					<span className="shrink-0 text-[0.625rem] text-muted-foreground font-ui">
						{slot.length} lletres
					</span>
				</div>
				{foundClueText ? renderClueLine(slot.id, foundClueText, "muted") : null}
				{renderIncomingRequests(slot.id)}
				{renderHelpedConfirmation(slot.id)}
			</div>
		);
	};

	return (
		<div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
			<h3 className="mb-4 shrink-0 text-2xl font-extrabold tracking-tight lg:text-xl">
				Paraules
			</h3>
			<div className="min-w-0 px-1 pb-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
				{notFoundSlots.length > 0 ? (
					<h4 className="mb-1 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground font-ui">
						Per descobrir{" "}
						<span className="tabular-nums">{notFoundSlots.length}</span>
					</h4>
				) : null}
				{notFoundSlots.map((slot) => {
					const clueText = clueTextsByWordId[slot.id];
					const peerClue = peerCluesByWordId[slot.id];
					const hasIncoming = requestsByWordId.has(slot.id);
					const isHighlighted =
						cluedWordIds.has(slot.id) || Boolean(peerClue) || hasIncoming;
					const isWaitingForHelp = requestedHelp.has(slot.id) && !peerClue;

					return (
						<div
							key={slot.id}
							id={`${idPrefix}${wordRowId(slot.id)}`}
							className={`relative flex min-w-0 flex-col border-b border-border/60 py-2 pl-2 scroll-mt-4 ${
								isHighlighted ? "word-clue-marker" : ""
							}`}
						>
							<button
								type="button"
								onClick={() => onWordTap?.(slot.id)}
								className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm text-left cursor-pointer transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								<span
									className={`flex size-5 shrink-0 items-center justify-center ${isHighlighted ? "text-primary" : "text-muted-foreground"}`}
									aria-hidden="true"
								>
									{peerClue ? (
										<Users className="size-4" />
									) : cluedWordIds.has(slot.id) ? (
										<Sparkles className="size-4" />
									) : isWaitingForHelp ? (
										<Clock3 className="size-4" />
									) : (
										<Circle className="size-2" />
									)}
								</span>
								<span className="min-w-0 font-bold tracking-[0.3em] wrap-anywhere">
									{getDisplayedSlotWord(slot, cellLetters)}
								</span>
								<span className="ml-auto shrink-0 text-[0.625rem] text-muted-foreground font-ui">
									{slot.length} lletres
								</span>
							</button>
							{clueText ? renderClueLine(slot.id, clueText, "muted") : null}
							{peerClue ? (
								<span className="block pl-7 text-sm leading-relaxed wrap-anywhere font-ui">
									<span className="text-foreground">{peerClue.text}</span>
									<span className="mt-1 block text-xs text-muted-foreground">
										Pista de {peerClue.responderName}
									</span>
								</span>
							) : null}
							{canRequestHelp ? (
								<div className="pl-7">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-auto min-h-11 max-w-full gap-1.5 px-0 py-2 text-xs whitespace-normal font-ui text-primary hover:bg-transparent hover:text-primary hover:underline disabled:text-muted-foreground disabled:opacity-100 lg:min-h-9"
										disabled={isWaitingForHelp}
										onClick={() => onRequestHelp?.(slot.id)}
									>
										{isWaitingForHelp ? (
											<>
												<Clock3 className="size-3.5" />
												Esperant pista…
											</>
										) : (
											<>
												<Users className="size-3.5" />
												Demana ajuda
											</>
										)}
									</Button>
								</div>
							) : null}
						</div>
					);
				})}

				{needsHelpSlots.length > 0 ? (
					<h4
						className={`${notFoundSlots.length > 0 ? "mt-6" : ""} mb-1 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-wider text-primary font-ui`}
					>
						Ajuda pendent{" "}
						<span className="tabular-nums">{needsHelpSlots.length}</span>
					</h4>
				) : null}
				{needsHelpSlots.map(renderFoundSlot)}

				{otherFoundSlots.length > 0 ? (
					<h4
						className={`${notFoundSlots.length > 0 || needsHelpSlots.length > 0 ? "mt-6" : ""} mb-1 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-wider text-primary font-ui`}
					>
						Trobades{" "}
						<span className="tabular-nums">{otherFoundSlots.length}</span>
					</h4>
				) : null}
				{otherFoundSlots.map(renderFoundSlot)}
			</div>
		</div>
	);
}
