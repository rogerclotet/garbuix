import { useState } from "react";
import { toast } from "sonner";
import { validateClueText } from "@/lib/clue-fairness";
import type {
	FakeRequest,
	FakeWord,
	GivenHint,
	HelpedRecord,
	Scenario,
	ScenarioState,
} from "./fake-data";
import { wordsForScenario } from "./fake-data";

export type FakeSendResult = { ok: true } | { ok: false; reason: string };

export type FakeClueSession = {
	words: FakeWord[];
	requests: FakeRequest[];
	givenHints: GivenHint[];
	helped: HelpedRecord[];
	send(requestIds: string[], text: string): Promise<FakeSendResult>;
};

// Long enough to see the pending spinner, short enough not to annoy.
const FAKE_LATENCY_MS = 600;

const nameList = new Intl.ListFormat("ca", {
	style: "long",
	type: "conjunction",
});

export function formatNames(names: string[]): string {
	return nameList.format(names);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Same text resent to someone else folds into the existing entry, so the reuse
// list never shows one hint twice.
function upsertGivenHint(
	hints: GivenHint[],
	wordId: number,
	text: string,
	recipients: string[],
): GivenHint[] {
	const existing = hints.find(
		(given) =>
			given.wordId === wordId &&
			given.text.toLocaleLowerCase("ca") === text.toLocaleLowerCase("ca"),
	);
	if (!existing) {
		return [
			...hints,
			{
				id: `hint:${wordId}:${Date.now()}`,
				wordId,
				text,
				recipients,
				minutesAgo: 0,
			},
		];
	}
	return hints.map((given) =>
		given === existing
			? {
					...given,
					recipients: [...given.recipients, ...recipients],
					minutesAgo: 0,
				}
			: given,
	);
}

export function useFakeClueSession(scenario: Scenario): FakeClueSession {
	const [words] = useState(() => wordsForScenario(scenario));
	const [state, setState] = useState<ScenarioState>(() => scenario.build());

	const send = async (
		requestIds: string[],
		text: string,
	): Promise<FakeSendResult> => {
		const trimmed = text.trim();
		const targets = state.requests.filter((request) =>
			requestIds.includes(request.id),
		);
		const firstTarget = targets[0];
		if (!firstTarget) {
			return { ok: false, reason: "no_recipients" };
		}
		const word = words.find((candidate) => candidate.id === firstTarget.wordId);
		if (!word) {
			throw new Error(`Fake word ${firstTarget.wordId} is missing`);
		}

		await wait(FAKE_LATENCY_MS);
		const verdict = validateClueText(trimmed, word.answer);
		if (!verdict.ok) {
			return verdict;
		}

		const names = targets.map((request) => request.requesterName);
		setState((current) => ({
			requests: current.requests.filter(
				(request) => !requestIds.includes(request.id),
			),
			givenHints: upsertGivenHint(current.givenHints, word.id, trimmed, names),
			helped: [
				...current.helped,
				...targets.map((request) => ({
					requesterId: request.requesterId,
					requesterName: request.requesterName,
					wordId: request.wordId,
					hintText: trimmed,
				})),
			],
		}));
		toast.success(
			names.length === 1
				? "Pista enviada!"
				: `Pista enviada a ${formatNames(names)}`,
		);
		return { ok: true };
	};

	return { words, ...state, send };
}
