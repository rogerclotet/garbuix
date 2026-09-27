import { createFileRoute, getRouteApi } from "@tanstack/react-router";

const rootRoute = getRouteApi("__root__");
export const Route = createFileRoute("/privacitat")({
	head: () => ({ meta: [{ title: "La teva privacitat a Garbuix" }] }),
	component: PrivacyPage,
});

function PrivacyPage() {
	const { observability } = rootRoute.useLoaderData();
	return (
		<article className="mx-auto max-w-2xl space-y-8 px-4 py-8 text-sm leading-relaxed sm:py-12">
			<header className="space-y-3">
				<h2 className="text-3xl font-bold text-primary">
					La teva privacitat a Garbuix
				</h2>
			</header>
			{observability.analyticsEnabled && (
				<section className="space-y-3">
					<h3 className="text-base font-semibold">Les estadístiques del joc</h3>
					<p>
						Les estadístiques anònimes ens ajuden a entendre quines funcions del
						joc s'utilitzen i a millorar Garbuix. Només conservem totals diaris
						de visites i ús de les funcions, sense identificadors ni historials
						individuals. No fem servir galetes per a aquestes estadístiques ni
						les associem al teu compte.
					</p>
					<p>
						Podem enviar aquests totals a PostHog per consultar-ne els gràfics i
						els conservem durant un màxim de 90 dies. No els fem servir per fer
						publicitat ni crear perfils de jugadors.
					</p>
				</section>
			)}
			<section className="space-y-3">
				<h3 className="text-base font-semibold">El compte i el progrés</h3>
				<p>
					El joc desa el progrés i les preferències al dispositiu perquè puguis
					continuar jugant. Si entres amb Google, fem servir les dades del
					compte per iniciar la sessió, sincronitzar el progrés i oferir les
					funcions de classificació i ajuda entre jugadors.
				</p>
			</section>
			<section className="space-y-3">
				<h3 className="text-base font-semibold">Errors tècnics</h3>
				<p>
					Podem fer servir GlitchTip per detectar errors i problemes de
					rendiment. Eliminem dels informes els identificadors de compte i el
					contingut de les peticions.
				</p>
			</section>
			<footer className="border-t border-border/40 pt-5 text-muted-foreground">
				<p>
					Garbuix és un joc de Roger Clotet. Per consultar o demanar
					l'eliminació de les teves dades, escriu a{" "}
					<a
						href="mailto:roger@clotet.dev"
						className="underline underline-offset-4 hover:text-foreground"
					>
						roger@clotet.dev
					</a>
					.
				</p>
			</footer>
		</article>
	);
}
