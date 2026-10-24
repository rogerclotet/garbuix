// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClueHelpGiven, ClueRequest } from "@/lib/clue-request-types";
import type { RespondResult } from "@/lib/use-clue-requests";
import {
	ClueResponder,
	collectGivenHints,
	type GivenHint,
} from "./clue-responder";

const request: ClueRequest = {
	id: "request-1",
	dateKey: "2026-10-24",
	puzzleId: "puzzle-1",
	wordId: 3,
	wordLength: 6,
	requesterId: "marta",
	requesterName: "Marta",
	createdAt: "2026-10-24T10:00:00.000Z",
	requesterHasAiClue: false,
};

const CLUE = "Animal de crinera llarga que es munta i fa renills.";

function helped(
	requesterName: string,
	at: string,
	overrides: Partial<ClueHelpGiven> = {},
): ClueHelpGiven {
	return {
		requesterId: requesterName.toLowerCase(),
		requesterName,
		wordId: 3,
		at,
		text: "Hi puja un genet",
		...overrides,
	};
}

function renderResponder({
	clueText = CLUE,
	givenHints = [],
	requesterHasAiClue = false,
	result = { ok: true },
}: {
	clueText?: string | null;
	givenHints?: GivenHint[];
	requesterHasAiClue?: boolean;
	result?: RespondResult;
} = {}) {
	const onRespond = vi.fn(async () => result);
	const onDone = vi.fn();
	render(
		<ClueResponder
			request={{ ...request, requesterHasAiClue }}
			clueText={clueText}
			givenHints={givenHints}
			onRespond={onRespond}
			onDone={onDone}
		/>,
	);
	return { onRespond, onDone };
}

function sendButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement;
}

afterEach(() => {
	cleanup();
});

describe("collectGivenHints", () => {
	it("folds one text sent to several askers into a hint, newest first", () => {
		const hints = collectGivenHints(
			[
				helped("Anna", "2026-10-24T09:00:00.000Z"),
				helped("Pau", "2026-10-24T09:30:00.000Z", { text: "Fa renills" }),
				helped("Jordi", "2026-10-24T09:40:00.000Z", {
					text: "hi puja un genet",
				}),
			],
			3,
		);
		expect(hints).toEqual([
			{
				text: "Hi puja un genet",
				recipients: ["Anna", "Jordi"],
				at: "2026-10-24T09:40:00.000Z",
			},
			{
				text: "Fa renills",
				recipients: ["Pau"],
				at: "2026-10-24T09:30:00.000Z",
			},
		]);
	});

	it("leaves out other words and records saved without the hint", () => {
		const hints = collectGivenHints(
			[
				helped("Anna", "2026-10-24T09:00:00.000Z", { wordId: 4 }),
				helped("Pau", "2026-10-24T09:30:00.000Z", { text: undefined }),
			],
			3,
		);
		expect(hints).toEqual([]);
	});
});

describe("ClueResponder", () => {
	it("opens the text box only for Escriu-la", () => {
		renderResponder();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(sendButton().disabled).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "Escriu-la" }));
		expect(screen.getByRole("textbox")).toBeTruthy();
	});

	it("sends the word's clue when copying it", async () => {
		const { onRespond, onDone } = renderResponder();
		fireEvent.click(screen.getByRole("button", { name: "Copia la pista" }));
		fireEvent.click(sendButton());
		await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
		expect(onRespond).toHaveBeenCalledWith("request-1", CLUE);
	});

	it("won't copy a clue the asker already has", () => {
		renderResponder({ requesterHasAiClue: true });
		const copy = screen.getByRole("button", {
			name: "Copia la pista",
		}) as HTMLButtonElement;
		expect(copy.disabled).toBe(true);
		expect(
			screen.getByText(
				"Marta ja té la pista, prova de donar-ne una de diferent.",
			),
		).toBeTruthy();
	});

	it("leaves out the copy chip while the word has no clue", () => {
		renderResponder({ clueText: null });
		expect(screen.queryByRole("button", { name: "Copia la pista" })).toBeNull();
	});

	it("previews and resends one of today's hints", async () => {
		const longHint =
			"Té ferradures a les potes perquè no se li gastin les peülles i menja palla";
		const { onRespond, onDone } = renderResponder({
			givenHints: [
				{ text: longHint, recipients: ["Pau"], at: new Date().toISOString() },
			],
		});
		fireEvent.click(screen.getByRole("button", { name: longHint }));
		expect(screen.getByText(longHint, { selector: "p" })).toBeTruthy();
		expect(screen.getByText(/Enviada a Pau/)).toBeTruthy();
		fireEvent.click(sendButton());
		await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
		expect(onRespond).toHaveBeenCalledWith("request-1", longHint);
	});

	it("keeps older hints behind +N més", () => {
		const at = "2026-10-24T09:00:00.000Z";
		renderResponder({
			givenHints: [
				{ text: "Fa renills", recipients: ["Lluna"], at },
				{ text: "Hi puja un genet", recipients: ["Jordi"], at },
				{ text: "Menja palla", recipients: ["Anna"], at },
			],
		});
		expect(screen.queryByRole("button", { name: "Menja palla" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "+1 més" }));
		expect(screen.getByRole("button", { name: "Menja palla" })).toBeTruthy();
	});

	it("explains a rejected hint and stays open to fix it", async () => {
		const { onDone } = renderResponder({
			result: { ok: false, reason: "too_similar" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Escriu-la" }));
		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "cavalls" },
		});
		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
		expect(
			await screen.findByText("La pista s'assembla massa a la paraula"),
		).toBeTruthy();
		expect(onDone).not.toHaveBeenCalled();
	});
});
