import { Loader2, Send } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CLUE_LENGTH } from "@/lib/clue-fairness";
import type { ClueRequest } from "@/lib/clue-request-types";
import type { RespondResult } from "@/lib/use-clue-requests";

function reasonMessage(reason: string | null): string {
	switch (reason) {
		case "too_similar":
			return "La pista s'assembla massa a la paraula";
		case "too_long":
			return "La pista és massa llarga";
		case "empty":
			return "Escriu alguna cosa";
		default:
			return "No s'ha pogut enviar la pista";
	}
}

// Inline composer for replying to a peer's clue request. Shared by the request
// toast and the word list so a responder can help from either surface. Fairness
// feedback (e.g. "too similar") surfaces inline rather than as a separate toast.
export function ClueResponder({
	request,
	onRespond,
	onDone,
	onCapture,
	intro,
	initialText = "",
}: {
	request: ClueRequest;
	onRespond: (requestId: string, text: string) => Promise<RespondResult>;
	onDone: () => void;
	onCapture?: (event: string, props?: Record<string, unknown>) => void;
	intro?: ReactNode;
	// Prefilled composer text — e.g. the AI clue dropped in via the copy button.
	initialText?: string;
}) {
	// The asker already unlocked the word's AI clue: nudge the responder to give a
	// different one, since copying it back would tell the asker nothing new.
	const showAiClueNote = request.requesterHasAiClue;
	const [text, setText] = useState(initialText);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		const trimmed = text.trim();
		if (trimmed.length === 0 || pending) return;
		setPending(true);
		setError(null);
		const result = await onRespond(request.id, trimmed);
		setPending(false);
		if (result.ok) {
			onCapture?.("peer_clue_responded", {
				word_id: request.wordId,
				date_key: request.dateKey,
			});
			toast.success("Pista enviada!");
			onDone();
			return;
		}
		onCapture?.("peer_clue_response_rejected", {
			word_id: request.wordId,
			reason: result.reason ?? "unknown",
		});
		setError(reasonMessage(result.reason));
	};

	return (
		<div className="flex w-full flex-col gap-2">
			<p className="text-sm font-medium">
				{intro ?? (
					<>
						{request.requesterName} demana ajuda amb una paraula de{" "}
						{request.wordLength} lletres
					</>
				)}
			</p>
			{showAiClueNote ? (
				<p className="text-xs text-muted-foreground">
					{request.requesterName} ja té la pista, prova de donar-ne una de
					diferent.
				</p>
			) : null}
			<Textarea
				autoFocus
				value={text}
				maxLength={MAX_CLUE_LENGTH}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						void submit();
					}
				}}
				placeholder="Escriu una pista (sense dir la paraula!)"
				className="min-h-12 text-sm"
				aria-invalid={error != null}
			/>
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
			<div className="flex items-center justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
					Ara no
				</Button>
				<Button
					size="sm"
					className="gap-1.5"
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
