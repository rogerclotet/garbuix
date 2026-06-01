import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ClueResponder } from "@/components/clue/clue-responder";
import type { ClueRequest } from "@/lib/clue-request-types";
import { useClueRequests } from "@/lib/use-clue-requests";
import { useObservability } from "@/lib/use-observability";

const TOAST_DURATION_MS = 30_000;
const GLOBAL_TOAST_GAP_MS = 1_000;

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
