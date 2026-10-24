import type { ComponentType } from "react";
import type { FakeSendResult } from "./fake-clue-session";
import type {
	FakeRequest,
	FakeWord,
	GivenHint,
	HelpedRecord,
} from "./fake-data";

export type HelpRowsProps = {
	word: FakeWord;
	// Requests for this word the player hasn't answered yet.
	openRequests: FakeRequest[];
	helped: HelpedRecord[];
	// This player's own hints for the word today, newest first.
	givenHints: GivenHint[];
	onSend: (requestIds: string[], text: string) => Promise<FakeSendResult>;
};

export type CluePrototype = {
	id: "a" | "b" | "c";
	name: string;
	summary: string;
	HelpRows: ComponentType<HelpRowsProps>;
	// Whether the word row should drop its own AI clue line, because the
	// prototype already shows that text next to the open requests.
	hidesAiClue: (openRequests: FakeRequest[]) => boolean;
};

// Mirrors clue-responder.tsx so rejections read the same as in the game.
export function reasonMessage(reason: string | null): string {
	switch (reason) {
		case "too_similar":
			return "La pista s'assembla massa a la paraula";
		case "too_long":
			return "La pista és massa llarga";
		case "empty":
			return "Escriu alguna cosa";
		case "already_helped":
			return "Ja has ajudat amb aquesta paraula";
		case "no_recipients":
			return "Tria a qui l'envies";
		default:
			return "No s'ha pogut enviar la pista";
	}
}

export function minutesAgoLabel(minutes: number): string {
	if (minutes < 1) return "ara mateix";
	if (minutes < 60) return `fa ${minutes} min`;
	return `fa ${Math.floor(minutes / 60)} h`;
}

// Same row height and type as the game's "Ajuda X" / "Has ajudat X" rows.
export const HELP_ROW_CLASS_NAME =
	"flex min-h-9 max-w-full w-fit items-center gap-1.5 py-1.5 text-left text-sm font-ui lg:min-h-8";

export const COMPOSER_TEXTAREA_CLASS_NAME =
	"min-h-12 rounded-sm border-border bg-background text-sm hover:border-primary/60 focus-visible:border-primary focus-visible:ring-primary/20 dark:bg-background aria-invalid:hover:border-destructive";
