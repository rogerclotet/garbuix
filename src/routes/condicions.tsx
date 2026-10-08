import { createFileRoute, Link } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/condicions")({
	head: () => ({
		meta: [{ title: "Condicions d'ús - Garbuix!" }],
	}),
	component: TermsPage,
});

function TermsPage() {
	return (
		<article className="mx-auto max-w-2xl space-y-8 px-4 py-8 text-sm leading-relaxed sm:py-12">
			<header className="space-y-4 border-b border-border/40 pb-6">
				<div className="flex items-start gap-4">
					<ScrollText
						className="mt-1 size-8 shrink-0 text-primary"
						aria-hidden
					/>
					<p className="text-base text-muted-foreground">
						Garbuix és un joc gratuït de mots encreuats en català. Si hi jugues
						o participes a la comunitat de Reddit, acceptes aquestes condicions.
					</p>
				</div>
				<p className="text-xs text-muted-foreground">
					Actualitzades el 8 d'octubre de 2026
				</p>
			</header>

			<section className="space-y-3" aria-labelledby="qui">
				<h2 id="qui" className="text-base font-semibold">
					Qui ofereix el joc?
				</h2>
				<p>
					Roger Clotet ofereix Garbuix, Garbuix mini i Garbuix síl·labes a
					garbuix.app. Per a qualsevol consulta, escriu a{" "}
					<a href="mailto:roger@clotet.dev" className="text-link">
						roger@clotet.dev
					</a>
					.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="us">
				<h2 id="us" className="text-base font-semibold">
					Ús del joc
				</h2>
				<p>
					El joc és gratuït i no cal crear cap compte per jugar-hi. No intentis
					alterar el funcionament del servei, automatitzar partides ni falsejar
					els resultats de la classificació.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="noms-pistes">
				<h2 id="noms-pistes" className="text-base font-semibold">
					Noms de jugador i pistes
				</h2>
				<p>
					El nom que mostres a la classificació i les pistes que envies a altres
					jugadors han de ser respectuosos. No hi incloguis insults, publicitat
					ni dades personals.
				</p>
				<p>
					Podem amagar o eliminar els noms i les pistes que no compleixin
					aquestes condicions, i limitar l'accés a la classificació o a
					l'intercanvi de pistes a qui les incompleixi.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="reddit">
				<h2 id="reddit" className="text-base font-semibold">
					La comunitat de Reddit
				</h2>
				<p>
					A{" "}
					<a href="https://www.reddit.com/r/garbuix/" className="text-link">
						r/garbuix
					</a>{" "}
					es parla del joc. Cada dia, l'aplicació garbuix-bot hi publica la
					imatge del Garbuix del dia i fixa la publicació a la part superior de
					la comunitat. L'aplicació no fa res més a Reddit.
				</p>
				<p>
					El que publiques a la comunitat es regeix per les{" "}
					<a
						href="https://redditinc.com/policies/user-agreement"
						className="text-link"
					>
						condicions d'ús de Reddit
					</a>{" "}
					i les normes de r/garbuix. Si comentes les paraules del dia, amaga-les
					com a espòiler per no espatllar la partida a qui encara no ha jugat.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="codi">
				<h2 id="codi" className="text-base font-semibold">
					Codi obert i continguts
				</h2>
				<p>
					El codi del joc és obert i es publica sota la llicència GPL-3.0 a{" "}
					<a
						href="https://github.com/rogerclotet/garbuix"
						className="text-link"
					>
						GitHub
					</a>
					. Les paraules i els patrons de separació provenen de les fonts que
					s'indiquen a{" "}
					<Link to="/sobre-el-joc" className="text-link">
						Sobre el joc
					</Link>
					, amb les seves pròpies llicències. Pots compartir lliurement les
					imatges del teu progrés.
				</p>
			</section>

			<section className="space-y-3" aria-labelledby="disponibilitat">
				<h2 id="disponibilitat" className="text-base font-semibold">
					Disponibilitat i errors
				</h2>
				<p>
					Oferim el joc tal com és, sense garanties. Els mots encreuats, les
					pistes generades amb intel·ligència artificial i la classificació
					poden contenir errors, i el servei pot aturar-se o canviar en
					qualsevol moment. Si trobes un error, escriu-nos.
				</p>
			</section>

			<section
				className="space-y-3 border-t border-border/40 pt-6"
				aria-labelledby="canvis"
			>
				<h2 id="canvis" className="text-base font-semibold">
					Canvis i privacitat
				</h2>
				<p>
					Podem actualitzar aquestes condicions; la data de la part superior
					indica la versió vigent. Com tractem les dades s'explica a la{" "}
					<Link to="/privacitat" className="text-link">
						política de privacitat
					</Link>
					.
				</p>
			</section>
		</article>
	);
}
