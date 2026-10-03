import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/error-test")({
	head: () => ({
		meta: [
			{ title: "Prova d'errors - Garbuix!" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	server: {
		handlers: {
			POST: () => {
				throw new Error("Garbuix error-test: server error");
			},
		},
	},
	component: ErrorTestPage,
});

function ErrorTestPage() {
	const [pending, setPending] = useState(false);
	const [status, setStatus] = useState("");

	async function triggerServerError() {
		setPending(true);
		setStatus("");
		try {
			const response = await fetch("/error-test", { method: "POST" });
			setStatus(`Resposta del servidor: HTTP ${response.status}.`);
		} catch {
			setStatus("No s'ha pogut contactar amb el servidor.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
			<h1 className="text-2xl font-bold">Prova d'errors</h1>
			<p className="text-muted-foreground">
				Cada botó provoca un error intencionat per comprovar que es registra.
			</p>
			<div className="flex flex-wrap gap-3">
				<Button
					type="button"
					onClick={() => {
						throw new Error("Garbuix error-test: client error");
					}}
				>
					Provoca un error al client
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={pending}
					onClick={triggerServerError}
				>
					Provoca un error al servidor
				</Button>
			</div>
			<p role="status" className="text-sm text-muted-foreground">
				{status}
			</p>
		</div>
	);
}
