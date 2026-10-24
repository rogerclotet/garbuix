import { Check, Circle, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { FakeClueSession } from "./fake-clue-session";
import type { FakeWord } from "./fake-data";
import { UNFOUND_LENGTHS } from "./fake-data";
import type { CluePrototype } from "./prototype-shared";

// A static copy of DailyWordList's layout with the help rows swapped for the
// prototype under test. Section headers and word rows share one keyed list, so
// a word moving from "Ajuda pendent" to "Trobades" keeps its component (and an
// open sheet can animate out instead of vanishing).

function SectionHeader({
	children,
	count,
	tone,
	spaced,
}: {
	children: ReactNode;
	count: number;
	tone: "muted" | "primary";
	spaced: boolean;
}) {
	return (
		<h4
			className={`${spaced ? "mt-6" : ""} mb-1 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-wider font-ui ${
				tone === "primary" ? "text-primary" : "text-muted-foreground"
			}`}
		>
			{children} <span className="tabular-nums">{count}</span>
		</h4>
	);
}

function FoundWordRow({
	word,
	session,
	prototype,
}: {
	word: FakeWord;
	session: FakeClueSession;
	prototype: CluePrototype;
}) {
	const { HelpRows } = prototype;
	const openRequests = session.requests.filter(
		(request) => request.wordId === word.id,
	);
	const helped = session.helped.filter((record) => record.wordId === word.id);
	const givenHints = session.givenHints
		.filter((given) => given.wordId === word.id)
		.sort((a, b) => a.minutesAgo - b.minutesAgo);
	const showAiClue =
		word.aiClue != null && !prototype.hidesAiClue(openRequests);

	return (
		<div className="flex min-w-0 flex-col border-b border-border/60 py-2 pl-2">
			<div className="flex min-h-11 items-center gap-2">
				<Check className="size-5 shrink-0 text-primary" aria-hidden="true" />
				<span className="min-w-0 font-semibold text-foreground tracking-wider wrap-anywhere">
					{word.answer.toUpperCase()}
				</span>
				<span className="ml-auto flex size-11 shrink-0 items-center justify-center text-muted-foreground lg:size-9">
					<Info className="size-4" aria-hidden="true" />
				</span>
				<span className="shrink-0 text-[0.625rem] text-muted-foreground font-ui">
					{word.answer.length} lletres
				</span>
			</div>
			{showAiClue ? (
				<div className="flex min-w-0 items-start gap-1 pl-7">
					<span className="block min-w-0 flex-1 text-sm leading-relaxed wrap-anywhere font-ui text-muted-foreground">
						{word.aiClue}
					</span>
				</div>
			) : null}
			<HelpRows
				word={word}
				openRequests={openRequests}
				helped={helped}
				givenHints={givenHints}
				onSend={session.send}
			/>
		</div>
	);
}

function UnfoundWordRow({ length }: { length: number }) {
	return (
		<div className="flex min-h-11 min-w-0 items-center gap-2 border-b border-border/60 py-2 pl-2">
			<span
				className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
				aria-hidden="true"
			>
				<Circle className="size-2" />
			</span>
			<span className="min-w-0 font-bold tracking-[0.3em] wrap-anywhere">
				{"_".repeat(length)}
			</span>
			<span className="ml-auto shrink-0 text-[0.625rem] text-muted-foreground font-ui">
				{length} lletres
			</span>
		</div>
	);
}

export function PrototypeWordList({
	session,
	prototype,
}: {
	session: FakeClueSession;
	prototype: CluePrototype;
}) {
	const pendingWordIds = new Set(
		session.requests.map((request) => request.wordId),
	);
	const pendingWords = session.words.filter((word) =>
		pendingWordIds.has(word.id),
	);
	const otherWords = session.words.filter(
		(word) => !pendingWordIds.has(word.id),
	);

	const rows: ReactNode[] = [
		<SectionHeader
			key="header:unfound"
			count={UNFOUND_LENGTHS.length}
			tone="muted"
			spaced={false}
		>
			Per descobrir
		</SectionHeader>,
		...UNFOUND_LENGTHS.map((length) => (
			<UnfoundWordRow key={`unfound:${length}`} length={length} />
		)),
	];
	if (pendingWords.length > 0) {
		rows.push(
			<SectionHeader
				key="header:pending"
				count={pendingWords.length}
				tone="primary"
				spaced
			>
				Ajuda pendent
			</SectionHeader>,
		);
	}
	rows.push(
		...pendingWords.map((word) => (
			<FoundWordRow
				key={`word:${word.id}`}
				word={word}
				session={session}
				prototype={prototype}
			/>
		)),
	);
	rows.push(
		<SectionHeader
			key="header:found"
			count={otherWords.length}
			tone="primary"
			spaced
		>
			Trobades
		</SectionHeader>,
		...otherWords.map((word) => (
			<FoundWordRow
				key={`word:${word.id}`}
				word={word}
				session={session}
				prototype={prototype}
			/>
		)),
	);

	return (
		<div className="flex min-w-0 flex-col">
			<h3 className="mb-4 shrink-0 text-2xl font-extrabold tracking-tight lg:text-xl">
				Paraules
			</h3>
			<div className="min-w-0 px-1 pb-1">{rows}</div>
		</div>
	);
}
