// Throwaway fixtures for the peer-clue composer prototypes at /prototips/pistes.
// Nothing here talks to the server: answers live in plain text so the fake
// send can run the real fairness check locally.

export type FakeWord = {
	id: number;
	answer: string;
	aiClue: string | null;
};

export type FakeRequest = {
	id: string;
	wordId: number;
	requesterId: string;
	requesterName: string;
	requesterHasAiClue: boolean;
	minutesAgo: number;
};

// A hint this player already sent today for a word. Resending the same text to
// another asker adds them to `recipients` instead of creating a second entry.
export type GivenHint = {
	id: string;
	wordId: number;
	text: string;
	recipients: string[];
	minutesAgo: number;
};

export type HelpedRecord = {
	requesterId: string;
	requesterName: string;
	wordId: number;
	hintText: string;
};

export type ScenarioState = {
	requests: FakeRequest[];
	givenHints: GivenHint[];
	helped: HelpedRecord[];
};

export type Scenario = {
	id: string;
	label: string;
	description: string;
	longTexts?: boolean;
	build: () => ScenarioState;
};

const SHORT_CLUES: Record<number, string> = {
	1: "Animal de crinera llarga que es munta i fa renills.",
	2: "Lloc amb sorra i onades on anem a l'estiu.",
	3: "Conjunt de fulls enquadernats que es llegeix.",
	4: "Obertura a la paret per on entra la llum.",
	5: "Aparell que marca les hores.",
};

const LONG_CLUES: Record<number, string> = {
	1: "Mamífer herbívor de crinera llarga i cua de pèl que la gent ha fet servir durant segles per desplaçar-se, llaurar i tirar de carros.",
	2: "Franja de sorra o de còdols vora el mar on la gent es banya, pren el sol i construeix castells quan fa calor a l'estiu.",
	3: "Obra escrita o impresa en fulls cosits per un costat i protegits amb una coberta, que trobem a les biblioteques i a les llibreries.",
	4: "Forat a la paret d'una casa, normalment amb vidres i porticons, que deixa passar la llum i l'aire i des d'on es pot mirar el carrer.",
	5: "Instrument amb agulles o xifres que indica l'hora del dia i que pot ser de paret, de polsera o de butxaca, com el del campanar.",
};

export const FOUND_WORDS: FakeWord[] = [
	{ id: 1, answer: "cavall", aiClue: null },
	{ id: 2, answer: "platja", aiClue: null },
	{ id: 3, answer: "llibre", aiClue: null },
	{ id: 4, answer: "finestra", aiClue: null },
	{ id: 5, answer: "rellotge", aiClue: null },
];

export const UNFOUND_LENGTHS = [5, 7, 9];

export function wordsForScenario(scenario: Scenario): FakeWord[] {
	const clues = scenario.longTexts ? LONG_CLUES : SHORT_CLUES;
	return FOUND_WORDS.map((word) => ({
		...word,
		aiClue: clues[word.id] ?? null,
	}));
}

function request(
	wordId: number,
	requesterName: string,
	options: { hasAiClue?: boolean; minutesAgo?: number } = {},
): FakeRequest {
	const requesterId = requesterName.toLowerCase().replace(/\s+/g, "-");
	return {
		id: `${requesterId}:${wordId}`,
		wordId,
		requesterId,
		requesterName,
		requesterHasAiClue: options.hasAiClue ?? false,
		minutesAgo: options.minutesAgo ?? 1,
	};
}

function hint(
	wordId: number,
	text: string,
	recipients: string[],
	minutesAgo: number,
): GivenHint {
	return {
		id: `hint:${wordId}:${minutesAgo}`,
		wordId,
		text,
		recipients,
		minutesAgo,
	};
}

function helpedFrom(hints: GivenHint[]): HelpedRecord[] {
	return hints.flatMap((given) =>
		given.recipients.map((name) => ({
			requesterId: name.toLowerCase().replace(/\s+/g, "-"),
			requesterName: name,
			wordId: given.wordId,
			hintText: given.text,
		})),
	);
}

function stateWithHints(
	requests: FakeRequest[],
	givenHints: GivenHint[],
): ScenarioState {
	return { requests, givenHints, helped: helpedFrom(givenHints) };
}

export const SCENARIOS: Scenario[] = [
	{
		id: "primera",
		label: "Primera ajuda",
		description:
			"Una petició i cap pista donada encara. Només hi ha la pista Garbuix.",
		build: () => stateWithHints([request(1, "Anna")], []),
	},
	{
		id: "reutilitza",
		label: "Pistes per reutilitzar",
		description:
			"La Marta demana CAVALL. Avui ja n'has donat dues pistes, a l'Anna i al Pau.",
		build: () =>
			stateWithHints(
				[request(1, "Marta")],
				[
					hint(1, "Hi puja un genet", ["Anna"], 42),
					hint(1, "Té ferradures i menja palla", ["Pau"], 12),
				],
			),
	},
	{
		id: "diversos",
		label: "Diversos jugadors",
		description:
			"Tres jugadors demanen PLATJA (un ja té la pista Garbuix) i un altre demana LLIBRE.",
		build: () =>
			stateWithHints(
				[
					request(2, "Anna", { minutesAgo: 6 }),
					request(2, "Pau", { minutesAgo: 3 }),
					request(2, "Guineu àgil", { hasAiClue: true, minutesAgo: 1 }),
					request(3, "Jordi", { minutesAgo: 2 }),
				],
				[hint(2, "On estenem la tovallola al juliol", ["Marta"], 30)],
			),
	},
	{
		id: "te-ia",
		label: "Ja té la pista Garbuix",
		description:
			"El Jordi ja ha desbloquejat la pista Garbuix de FINESTRA. Tens una pista teva d'abans.",
		build: () =>
			stateWithHints(
				[request(4, "Jordi", { hasAiClue: true })],
				[hint(4, "Si la deixes oberta entra fred", ["Anna"], 20)],
			),
	},
	{
		id: "te-ia-sense",
		label: "Ja té la pista Garbuix, cap de teva",
		description:
			"El Pau ja té la pista Garbuix de RELLOTGE i tu no n'has donat cap. No hi ha res a reutilitzar.",
		build: () => stateWithHints([request(5, "Pau", { hasAiClue: true })], []),
	},
	{
		id: "llargs",
		label: "Textos llargs",
		description:
			"Pista Garbuix i pistes teves a prop del límit de 140 caràcters, amb quatre pistes per reutilitzar.",
		longTexts: true,
		build: () =>
			stateWithHints(
				[request(1, "Marta"), request(1, "Ós bru")],
				[
					hint(
						1,
						"Animal que trobaràs als estables, que menja palla i civada i que porta ferradures a les potes perquè no se li gastin les peülles",
						["Anna"],
						55,
					),
					hint(
						1,
						"El cowboy de les pel·lícules de l'oest sempre en porta un, el lliga davant del saloon abans d'entrar-hi a beure",
						["Pau"],
						31,
					),
					hint(1, "Hi puja un genet", ["Jordi", "Guineu àgil"], 18),
					hint(1, "Fa renills", ["Lluna"], 4),
				],
			),
	},
];

export const DEFAULT_SCENARIO_ID = "reutilitza";
