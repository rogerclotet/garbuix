import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacitat")({
	head: () => ({
		meta: [{ title: "Política de privacitat - Garbuix!" }],
	}),
	component: PrivacyPage,
});

const linkClass =
	"underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

function PrivacyPage() {
	return (
		<article className="mx-auto max-w-2xl space-y-8 px-4 py-8 text-sm leading-relaxed sm:py-12">
			<header className="space-y-4 border-b border-border/40 pb-6">
				<div className="flex items-start gap-4">
					<ShieldCheck
						className="mt-1 size-8 shrink-0 text-primary"
						aria-hidden
					/>
					<p className="text-base text-muted-foreground">
						Pots jugar sense compte. Desem el progrés per poder continuar la
						partida i recollim informació tècnica limitada per corregir errors.
					</p>
				</div>
				<p className="text-xs text-muted-foreground">
					Actualitzada el 3 d'octubre de 2026
				</p>
			</header>

			<section className="space-y-3" aria-labelledby="responsable">
				<h2 id="responsable" className="text-base font-semibold">
					Qui és el responsable?
				</h2>
				<p>
					Roger Clotet és el responsable del tractament de dades de Garbuix i
					Garbuix mini. Per a qualsevol consulta de privacitat, escriu a{" "}
					<a href="mailto:roger@clotet.dev" className={linkClass}>
						roger@clotet.dev
					</a>
					.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="dades">
				<h2 id="dades" className="text-base font-semibold">
					Quines dades fem servir i per què?
				</h2>
				<ul className="list-disc space-y-3 pl-5 marker:text-primary">
					<li>
						Sense compte, el navegador desa el progrés, l'historial i les
						preferències. Un identificador de convidat permet participar en la
						classificació i intercanviar pistes.
					</li>
					<li>
						Si entres amb Google, rebem el nom, el correu electrònic, la imatge
						de perfil i els identificadors necessaris per autenticar-te. Desem
						el compte, les sessions i el progrés per sincronitzar les partides
						entre dispositius. Les sessions poden incloure l'adreça IP i dades
						del navegador per gestionar l'accés.
					</li>
					<li>
						La classificació mostra el nom de jugador, l'avatar i els resultats.
						Les pistes que envies es comparteixen amb el jugador que les ha
						demanat. Evita incloure-hi dades personals.
					</li>
				</ul>
				<p>
					Tractem aquestes dades per prestar les funcions del joc que
					sol·licites, d'acord amb l'article 6.1.b del RGPD. Crear un compte és
					voluntari; sense identificar-te no podem sincronitzar les partides amb
					el teu compte.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="errors">
				<h2 id="errors" className="text-base font-semibold">
					Detecció d'errors amb GlitchTip
				</h2>
				<p>
					Fem servir una instància pròpia de GlitchTip per detectar fallades i
					reparar-les. Els informes contenen el tipus i el missatge d'error, els
					fitxers i les línies de codi afectades, la versió de l'aplicació i el
					moment de l'error. Excloem les dades del compte, les galetes, les
					capçaleres i el contingut de les peticions, i l'historial
					d'interaccions.
				</p>
				<p>
					No activem gravacions de sessió ni seguiment de comportament amb
					GlitchTip. Tot i que no afegim l'adreça IP als informes, el servei pot
					veure-la en rebre la connexió del navegador. Per això no considerem
					que aquests enviaments siguin completament anònims.
				</p>
				<p>
					La finalitat és mantenir el joc fiable i segur, sobre la base del
					nostre interès legítim, article 6.1.f del RGPD. Pots oposar-te a
					aquest tractament escrivint-nos.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="emmagatzematge">
				<h2 id="emmagatzematge" className="text-base font-semibold">
					Galetes i emmagatzematge al dispositiu
				</h2>
				<p>
					El joc utilitza galetes de sessió i de convidat, emmagatzematge local
					i memòria cau per recordar les partides, les preferències i permetre
					el funcionament sense connexió. La galeta de convidat té una durada
					màxima de 400 dies. No utilitzem galetes publicitàries.
				</p>
				<p>
					Pots esborrar aquestes dades des de la configuració del navegador.
					Això pot tancar la sessió i eliminar partides que només estiguin
					desades al dispositiu.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="proveidors">
				<h2 id="proveidors" className="text-base font-semibold">
					Proveïdors i transferències
				</h2>
				<p>
					Els proveïdors d'allotjament intervenen en el funcionament del servei.
					Google intervé quan tries iniciar-hi sessió. Fem servir Anthropic per
					generar pistes a partir de paraules del diccionari; no hi enviem el
					perfil del jugador per generar-les.
				</p>
				<p>
					Els informes d'errors s'envien a la nostra instància de GlitchTip.
					Pots demanar-nos informació sobre l'allotjament i el tractament
					d'aquestes dades per correu.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="conservacio">
				<h2 id="conservacio" className="text-base font-semibold">
					Quant de temps conservem les dades?
				</h2>
				<p>
					Les dades locals es conserven fins que les esborres. Les del compte i
					les partides es mantenen mentre conserves el compte o fins que
					n'obtinguis la supressió, llevat de les obligacions legals de
					conservació que siguin aplicables.
				</p>
				<p>
					Les dades de classificació en temps real caduquen 48 hores després de
					l'última actualització. Les pistes compartides i els registres de
					peticions tenen un termini de caducitat de 24 hores. Els informes
					d'errors tenen un termini de retenció de 90 dies, segons la
					configuració predeterminada de GlitchTip que utilitzem.
				</p>
			</section>

			<section
				className="space-y-3 border-t border-border/40 pt-6"
				aria-labelledby="drets"
			>
				<h2 id="drets" className="text-base font-semibold">
					Els teus drets
				</h2>
				<p>
					Pots sol·licitar l'accés, la rectificació, la supressió, la limitació
					i, quan correspongui, la portabilitat de les teves dades. També pots
					oposar-te al tractament basat en l'interès legítim. Escriu a{" "}
					<a href="mailto:roger@clotet.dev" className={linkClass}>
						roger@clotet.dev
					</a>
					. Si consideres que no hem atès els teus drets, pots presentar una
					reclamació davant l'{" "}
					<a href="https://www.aepd.es/" className={linkClass}>
						Agència Espanyola de Protecció de Dades
					</a>
					.
				</p>
			</section>
		</article>
	);
}
