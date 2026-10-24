import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useFakeClueSession } from "@/components/clue-prototypes/fake-clue-session";
import type { Scenario } from "@/components/clue-prototypes/fake-data";
import {
	DEFAULT_SCENARIO_ID,
	SCENARIOS,
} from "@/components/clue-prototypes/fake-data";
import { prototypeA } from "@/components/clue-prototypes/prototype-a-chips";
import { prototypeB } from "@/components/clue-prototypes/prototype-b-sheet";
import { prototypeC } from "@/components/clue-prototypes/prototype-c-quick";
import type { CluePrototype } from "@/components/clue-prototypes/prototype-shared";
import { PrototypeWordList } from "@/components/clue-prototypes/prototype-word-list";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// Throwaway playground for redesigning the peer-hint composer in Garbuix
// classic. Dev server only; every word, request and hint here is fake.

const PROTOTYPES: CluePrototype[] = [prototypeA, prototypeB, prototypeC];

type PrototypeId = CluePrototype["id"];

type PrototypeSearch = {
	v: PrototypeId;
	escenari: string;
};

function parsePrototypeId(value: unknown): PrototypeId {
	return value === "b" || value === "c" ? value : "a";
}

function parseScenarioId(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_SCENARIO_ID;
	return SCENARIOS.some((scenario) => scenario.id === value)
		? value
		: DEFAULT_SCENARIO_ID;
}

export const Route = createFileRoute("/prototips/pistes")({
	validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
		v: parsePrototypeId(search.v),
		escenari: parseScenarioId(search.escenari),
	}),
	beforeLoad: () => {
		if (!import.meta.env.DEV) {
			throw notFound();
		}
	},
	head: () => ({
		meta: [{ title: "Prototips de pistes - Garbuix!" }],
	}),
	component: CluePrototypesPage,
});

function findScenario(id: string): Scenario {
	const scenario =
		SCENARIOS.find((candidate) => candidate.id === id) ?? SCENARIOS[0];
	if (!scenario) {
		throw new Error("No prototype scenarios defined");
	}
	return scenario;
}

function PrototypeTabs({
	current,
	onSelect,
}: {
	current: PrototypeId;
	onSelect: (id: PrototypeId) => void;
}) {
	return (
		<div
			role="tablist"
			aria-label="Prototip"
			className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
		>
			{PROTOTYPES.map((prototype) => {
				const selected = prototype.id === current;
				return (
					<button
						key={prototype.id}
						type="button"
						role="tab"
						aria-selected={selected}
						onClick={() => onSelect(prototype.id)}
						className={`flex min-h-11 flex-col items-center justify-center rounded-md px-1 py-1 text-center transition-colors ${
							selected
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						<span className="text-sm font-bold">
							{prototype.id.toUpperCase()}
						</span>
						<span className="text-[0.6875rem] leading-tight font-ui">
							{prototype.name}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function PrototypeToolbar({
	prototype,
	scenario,
	showKeypad,
	onPrototypeChange,
	onScenarioChange,
	onReset,
	onShowKeypadChange,
}: {
	prototype: CluePrototype;
	scenario: Scenario;
	showKeypad: boolean;
	onPrototypeChange: (id: PrototypeId) => void;
	onScenarioChange: (id: string) => void;
	onReset: () => void;
	onShowKeypadChange: (show: boolean) => void;
}) {
	return (
		<section className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/40 p-3 font-ui">
			<div className="flex items-center justify-between gap-2">
				<p className="text-[0.625rem] font-medium uppercase tracking-wider text-primary">
					Prototip · dades falses
				</p>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<label htmlFor="proto-keypad-switch">Teclat del joc</label>
					<Switch
						id="proto-keypad-switch"
						checked={showKeypad}
						onCheckedChange={onShowKeypadChange}
					/>
				</div>
			</div>
			<PrototypeTabs current={prototype.id} onSelect={onPrototypeChange} />
			<p className="text-sm leading-snug">{prototype.summary}</p>
			<div className="flex items-center gap-2">
				<select
					value={scenario.id}
					onChange={(event) => onScenarioChange(event.target.value)}
					aria-label="Escenari"
					className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
				>
					{SCENARIOS.map((candidate) => (
						<option key={candidate.id} value={candidate.id}>
							{candidate.label}
						</option>
					))}
				</select>
				<Button variant="outline" size="lg" onClick={onReset}>
					<RotateCcw className="size-4" />
					Reinicia
				</Button>
			</div>
			<p className="text-xs leading-snug text-muted-foreground">
				{scenario.description} Prova d'escriure la paraula per veure el rebuig.
			</p>
		</section>
	);
}

// Stands in for the real keypad: fixed to the bottom on phones, in the right
// column on desktop, so the composer has to live with it the same way.
function FakeKeypad() {
	return (
		<div className="fixed inset-x-0 bottom-0 z-40 flex h-[17rem] flex-col items-center justify-center gap-3 border-t border-border bg-background/95 backdrop-blur lg:static lg:h-52 lg:rounded-xl lg:border">
			{[5, 6, 4].map((count) => (
				<div key={count} className="flex gap-2">
					{Array.from({ length: count }, (_, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder dots
							key={index}
							className="size-11 rounded-full bg-muted lg:size-9"
						/>
					))}
				</div>
			))}
			<span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground font-ui">
				Teclat (fals)
			</span>
		</div>
	);
}

function FakeBoard() {
	return (
		<div className="hidden min-h-96 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground font-ui lg:flex">
			Tauler
		</div>
	);
}

function PrototypeSession({
	scenario,
	prototype,
	showKeypad,
}: {
	scenario: Scenario;
	prototype: CluePrototype;
	showKeypad: boolean;
}) {
	const session = useFakeClueSession(scenario);
	return (
		<div className="mt-6 lg:grid lg:grid-cols-[1fr_18rem] lg:gap-x-8 xl:grid-cols-[1fr_20rem]">
			<FakeBoard />
			<div className="flex min-w-0 flex-col gap-6">
				{showKeypad ? <FakeKeypad /> : null}
				<PrototypeWordList session={session} prototype={prototype} />
			</div>
		</div>
	);
}

function CluePrototypesPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [resetCount, setResetCount] = useState(0);
	const [showKeypad, setShowKeypad] = useState(true);
	const prototype =
		PROTOTYPES.find((candidate) => candidate.id === search.v) ?? prototypeA;
	const scenario = findScenario(search.escenari);

	const updateSearch = (next: Partial<PrototypeSearch>) => {
		void navigate({
			search: (current) => ({ ...current, ...next }),
			replace: true,
		});
	};

	return (
		<div
			className={`mx-auto w-full max-w-5xl px-3 pt-2 sm:px-4 lg:px-8 lg:pt-4 lg:pb-8 ${
				showKeypad ? "pb-[calc(17rem+1rem)]" : "pb-8"
			}`}
		>
			<PrototypeToolbar
				prototype={prototype}
				scenario={scenario}
				showKeypad={showKeypad}
				onPrototypeChange={(v) => updateSearch({ v })}
				onScenarioChange={(escenari) => updateSearch({ escenari })}
				onReset={() => setResetCount((count) => count + 1)}
				onShowKeypadChange={setShowKeypad}
			/>
			{/* Keyed by scenario only: switching prototypes keeps what you sent,
			    so A, B and C can be compared on the same state. */}
			<PrototypeSession
				key={`${scenario.id}:${resetCount}`}
				scenario={scenario}
				prototype={prototype}
				showKeypad={showKeypad}
			/>
		</div>
	);
}
