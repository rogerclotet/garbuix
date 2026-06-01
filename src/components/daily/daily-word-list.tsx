import {
	Check,
	CheckCircle2,
	ClipboardCopy,
	HelpingHand,
	Loader2,
	Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { ClueResponder } from "@/components/clue/clue-responder";
import { Button } from "@/components/ui/button";
import type { ClueRequest } from "@/lib/clue-request-types";
import { wordRowId } from "@/lib/clue-request-types";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import type { RespondResult } from "@/lib/use-clue-requests";
import { getDisplayedSlotWord, getSortedWordSlots } from "./daily-helpers";

type DailyWordListProps = {
	puzzle: DailyPuzzlePublic;
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
	peerClueTextsByWordId?: Record<number, string>;
	onRequestHelp?: (wordId: number) => void;
	// The other side: requests from other players this user can help with.
	incomingRequests?: ClueRequest[];
	onRespondToClue?: (requestId: string, text: string) => Promise<RespondResult>;
};

export function DailyWordList({
	puzzle,
	guessedWordIds,
	revealedAnswers,
	cellLetters,
	clueTextsByWordId = {},
	clueWordIds = [],
	foundClueTextsByWordId = {},
	onWordTap,
	canRequestHelp = false,
	requestedHelpWordIds = [],
	peerClueTextsByWordId = {},
	onRequestHelp,
	incomingRequests = [],
	onRespondToClue,
}: DailyWordListProps) {
	const { foundSlots, notFoundSlots } = getSortedWordSlots(
		puzzle.wordSlots,
		guessedWordIds,
		cellLetters,
	);
	const cluedWordIds = new Set(clueWordIds);
	const requestedHelp = new Set(requestedHelpWordIds);

	const requestsByWordId = new Map<number, ClueRequest[]>();
	for (const request of incomingRequests) {
		const existing = requestsByWordId.get(request.wordId);
		if (existing) {
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
	// Names of askers this user has helped, kept per word so a confirmation stays
	// on the row after the request itself is resolved and removed.
	const [helpedNamesByWordId, setHelpedNamesByWordId] = useState<
		Record<number, string>
	>({});

	const respondAndRecord = async (
		request: ClueRequest,
		requestId: string,
		text: string,
	): Promise<RespondResult> => {
		if (!onRespondToClue) return { ok: false, reason: null };
		const result = await onRespondToClue(requestId, text);
		if (result.ok) {
			setHelpedNamesByWordId((current) => ({
				...current,
				[request.wordId]: request.requesterName,
			}));
		}
		return result;
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

	// Lazy route: drop a word's AI clue straight into the open composer.
	const handleUseClue = (wordId: number, clueText: string) => {
		const first = requestsByWordId.get(wordId)?.[0];
		if (!first) return;
		openComposer(first.id, clueText);
	};

	const renderIncomingRequests = (wordId: number) => {
		const requests = requestsByWordId.get(wordId);
		if (!requests || requests.length === 0 || !onRespondToClue) {
			return null;
		}

		return (
			<div className="flex flex-col gap-2 pl-7">
				{requests.map((request) =>
					activeRequestId === request.id ? (
						<ClueResponder
							key={`${request.id}:${composerNonceRef.current}`}
							request={request}
							onRespond={(requestId, text) =>
								respondAndRecord(request, requestId, text)
							}
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
							className="h-7 w-fit gap-1.5 px-2 text-xs font-ui text-primary hover:text-primary"
							onClick={() => openComposer(request.id, "")}
						>
							<HelpingHand className="size-3.5" />
							Ajuda {request.requesterName}
						</Button>
					),
				)}
			</div>
		);
	};

	const renderHelpedConfirmation = (wordId: number) => {
		const name = helpedNamesByWordId[wordId];
		if (!name) return null;
		return (
			<span className="flex items-center gap-1.5 pl-7 text-sm font-ui text-primary">
				<Check className="size-3.5 shrink-0" />
				Has ajudat a {name}
			</span>
		);
	};

	// An AI clue shown next to a word can be copied into the response composer,
	// but only when there's actually a request to answer for that word.
	const renderClueLine = (
		wordId: number,
		clueText: string,
		tone: "muted" | "foreground",
	) => (
		<div className="flex items-start gap-1 pl-7">
			<span
				className={`block flex-1 text-sm italic font-ui ${
					tone === "foreground" ? "text-foreground" : "text-muted-foreground"
				}`}
			>
				{clueText}
			</span>
			{requestsByWordId.has(wordId) && onRespondToClue ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
					aria-label="Fes servir aquesta pista"
					title="Fes servir aquesta pista"
					onClick={() => handleUseClue(wordId, clueText)}
				>
					<ClipboardCopy className="size-3.5" />
				</Button>
			) : null}
		</div>
	);

	return (
		<div className="space-y-2 lg:max-h-96 lg:overflow-y-auto">
			{notFoundSlots.map((slot) => {
				const clueText = clueTextsByWordId[slot.id];
				const peerClueText = peerClueTextsByWordId[slot.id];
				const hasIncoming = requestsByWordId.has(slot.id);
				const isHighlighted =
					cluedWordIds.has(slot.id) || Boolean(peerClueText) || hasIncoming;
				const isWaitingForHelp = requestedHelp.has(slot.id) && !peerClueText;

				return (
					<div
						key={slot.id}
						id={wordRowId(slot.id)}
						className={`flex flex-col gap-1.5 py-2.5 px-3 rounded-lg w-full scroll-mt-4 ${
							isHighlighted ? "clue-gradient-border" : "bg-muted/40"
						}`}
					>
						<button
							type="button"
							onClick={() => onWordTap?.(slot.id)}
							className="flex items-center gap-2 w-full text-left cursor-pointer"
						>
							<div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
							<span className="font-mono text-muted-foreground tracking-widest">
								{getDisplayedSlotWord(slot, cellLetters)}
							</span>
							<span className="text-xs text-muted-foreground ml-auto font-ui">
								{slot.length} lletres
							</span>
						</button>
						{clueText ? renderClueLine(slot.id, clueText, "muted") : null}
						{peerClueText ? (
							<span className="block text-sm italic text-foreground pl-7 font-ui">
								{peerClueText}
							</span>
						) : null}
						{renderIncomingRequests(slot.id)}
						{renderHelpedConfirmation(slot.id)}
						{canRequestHelp ? (
							<div className="pl-7">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 gap-1.5 px-2 text-xs font-ui text-muted-foreground hover:text-foreground"
									disabled={isWaitingForHelp}
									onClick={() => onRequestHelp?.(slot.id)}
								>
									{isWaitingForHelp ? (
										<>
											<Loader2 className="size-3.5 animate-spin" />
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

			{foundSlots.map((slot) => {
				const foundClueText = foundClueTextsByWordId[slot.id];

				return (
					<div
						key={slot.id}
						id={wordRowId(slot.id)}
						className="flex flex-col gap-2 rounded-lg bg-primary/8 py-2.5 px-3 scroll-mt-4"
					>
						<div className="flex items-center gap-2">
							<CheckCircle2 className="w-5 h-5 shrink-0 text-primary" />
							<a
								href={`https://aplicacions.llengua.gencat.cat/llc/AppJava/index.html?action=Principal&method=cerca_generica&input_cercar=${encodeURIComponent(revealedAnswers[slot.id] ?? "")}&tipusCerca=cerca.queSignifica`}
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium text-foreground tracking-widest hover:underline"
							>
								{revealedAnswers[slot.id]?.toUpperCase()}
							</a>
							<span className="text-xs text-muted-foreground ml-auto font-ui">
								{slot.length} lletres
							</span>
						</div>
						{foundClueText
							? renderClueLine(slot.id, foundClueText, "muted")
							: null}
						{renderIncomingRequests(slot.id)}
						{renderHelpedConfirmation(slot.id)}
					</div>
				);
			})}
		</div>
	);
}
