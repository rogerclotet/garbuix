import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CLUE_LENGTH } from "@/lib/clue-fairness";
import type { ClueRequest } from "@/lib/clue-request-types";
import { type RespondResult, useClueRequests } from "@/lib/use-clue-requests";
import { useObservability } from "@/lib/use-observability";

const TOAST_DURATION_MS = 30_000;
const GLOBAL_TOAST_GAP_MS = 1_000;

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

// Inline composer rendered inside the request toast so a responder can reply
// without leaving the game. Validation feedback (e.g. "too similar") surfaces
// here rather than as a separate toast.
function ClueResponder({
	request,
	onRespond,
	onDone,
	onCapture,
}: {
	request: ClueRequest;
	onRespond: (requestId: string, text: string) => Promise<RespondResult>;
	onDone: () => void;
	onCapture: (event: string, props?: Record<string, unknown>) => void;
}) {
	const [text, setText] = useState("");
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
			onCapture("peer_clue_responded", {
				word_id: request.wordId,
				date_key: request.dateKey,
			});
			toast.success("Pista enviada!");
			onDone();
			return;
		}
		onCapture("peer_clue_response_rejected", {
			word_id: request.wordId,
			reason: result.reason ?? "unknown",
		});
		setError(reasonMessage(result.reason));
	};

	return (
		<div className="flex w-full flex-col gap-2">
			<p className="text-sm font-medium">
				{request.requesterName} demana ajuda amb una paraula de{" "}
				{request.wordLength} lletres
			</p>
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

export function ClueRequestToasts() {
	const { subscribe, respondToClue, enabled } = useClueRequests();
	const { captureEvent } = useObservability();
	const nextEmitAtRef = useRef<number>(0);
	const shownIdsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!enabled) return;

		const showRequestToast = (request: ClueRequest) => {
			if (shownIdsRef.current.has(request.id)) return;
			shownIdsRef.current.add(request.id);

			const now = Date.now();
			const wait = Math.max(0, nextEmitAtRef.current - now);
			nextEmitAtRef.current = now + wait + GLOBAL_TOAST_GAP_MS;

			window.setTimeout(() => {
				captureEvent("peer_clue_request_received", {
					word_id: request.wordId,
					date_key: request.dateKey,
				});
				toast.custom(
					(id) => (
						<ClueResponder
							request={request}
							onRespond={respondToClue}
							onDone={() => toast.dismiss(id)}
							onCapture={captureEvent}
						/>
					),
					{ duration: TOAST_DURATION_MS },
				);
			}, wait);
		};

		const unsubscribe = subscribe((event) => {
			if (event.type === "request") {
				showRequestToast(event.request);
			}
		});

		return () => {
			unsubscribe();
		};
	}, [enabled, subscribe, respondToClue, captureEvent]);

	return null;
}
