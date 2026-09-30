import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Monitor, Server } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Throw through the real server-function middleware. Catching/capturing here
// would only prove manual capture, not automatic server error reporting.
const triggerServerError = createServerFn({ method: "POST" }).handler(
	async function sentryServerSmokeTest() {
		throw new Error("Sentry server verification");
	},
);

export const Route = createFileRoute("/error-test")({
	head: () => ({
		meta: [
			{ title: "Prova d'errors - Garbuix!" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: ErrorTestPage,
});

function ErrorTestPage() {
	const [clientTriggered, setClientTriggered] = useState(false);
	const [serverState, setServerState] = useState<
		"idle" | "pending" | "failed" | "unexpected-success"
	>("idle");

	function sentryClientSmokeTest() {
		setClientTriggered(true);
		throw new Error("Sentry browser verification");
	}

	async function testServer() {
		setServerState("pending");
		try {
			await triggerServerError();
			setServerState("unexpected-success");
		} catch {
			// The server owns this report. Do not duplicate it as a browser error.
			setServerState("failed");
		}
	}

	return (
		<section className="mx-auto max-w-xl px-5 py-12 sm:py-20">
			<p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				Diagnòstic temporal
			</p>
			<h1 className="text-3xl font-bold tracking-tight">Prova d'errors</h1>
			<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
				Cada botó provoca un error intencionat. Comprova que apareix a Sentry i
				que reps l'avís configurat. No es modifica cap partida.
			</p>
			<div className="mt-8 divide-y divide-border border-y border-border">
				<div className="space-y-4 py-6">
					<h2 className="flex items-center gap-3 font-semibold">
						<Monitor className="size-5 text-muted-foreground" aria-hidden />
						Navegador
					</h2>
					<Button
						variant="outline"
						size="lg"
						disabled={clientTriggered}
						onClick={sentryClientSmokeTest}
					>
						Provoca un error al navegador
					</Button>
					<p role="status" className="text-sm text-muted-foreground">
						{clientTriggered
							? "Error provocat. Comprova l'informe del navegador a Sentry."
							: "Comprova la captura automàtica d'un error de JavaScript."}
					</p>
				</div>
				<div className="space-y-4 py-6">
					<h2 className="flex items-center gap-3 font-semibold">
						<Server className="size-5 text-muted-foreground" aria-hidden />
						Servidor
					</h2>
					<Button
						variant="outline"
						size="lg"
						disabled={serverState !== "idle"}
						onClick={testServer}
					>
						Provoca un error al servidor
					</Button>
					<p role="status" className="text-sm text-muted-foreground">
						{serverState === "idle" &&
							"Comprova la captura d'una funció del servidor que falla."}
						{serverState === "pending" && "Esperant la resposta del servidor…"}
						{serverState === "failed" &&
							"La petició ha fallat. Comprova que Sentry ha rebut un informe del servidor."}
						{serverState === "unexpected-success" &&
							"La petició no ha fallat com s'esperava. Revisa la prova."}
					</p>
				</div>
			</div>
			<p className="mt-6 text-xs leading-relaxed text-muted-foreground">
				Per privacitat, el missatge de l'informe serà «Error details omitted for
				privacy». Identifica'l per l'hora, la versió i el punt del codi. Aquesta
				pàgina no confirma la recepció de l'informe. Recarrega-la per repetir
				les proves.
			</p>
		</section>
	);
}
