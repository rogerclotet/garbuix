import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { APP_RELEASE } from "@/lib/app-version";

export const Route = createFileRoute("/sobre-el-joc")({
	head: () => ({
		meta: [{ title: "Sobre el joc - Garbuix!" }],
	}),
	component: AboutPage,
});

function AboutPage() {
	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:py-12">
			<div className="flex items-center gap-5">
				<Logo className="h-20 w-12 shrink-0 text-primary" aria-hidden />
				<div className="space-y-1">
					<h2 className="text-3xl font-bold text-primary">Garbuix!</h2>
					<p className="text-muted-foreground">
						Un joc de mots encreuats en català.
					</p>
				</div>
			</div>
			<section className="space-y-3 text-sm leading-relaxed">
				<h3 className="text-base font-semibold">D'on surten les paraules?</h3>
				<p>
					Les paraules provenen del diccionari de{" "}
					<a
						href="https://github.com/Softcatala/catalan-dict-tools"
						className="text-link"
					>
						Softcatalà
					</a>
					. Per crear els mots encreuats, el joc prioritza les paraules més
					habituals segons la seva freqüència d'ús. També n'accepta d'altres de
					menys freqüents com a paraules extra.
				</p>
				<p>
					Garbuix mini i Garbuix síl·labes fan servir una selecció pròpia de
					paraules curtes i quotidianes, pensada per a infants que comencen a
					llegir.
				</p>
				<p>
					Garbuix síl·labes fa servir els patrons de{" "}
					<a
						href="https://github.com/jaumeortola/hyphen-ca"
						className="text-link"
					>
						hyphen-ca
					</a>
					, de Jaume Ortolà, publicats sota la llicència{" "}
					<a
						href="https://github.com/jaumeortola/hyphen-ca/blob/dac10c01eab7132c1ddf4a22e2ea8a3f6ee439ae/LICENSE"
						className="text-link"
					>
						GPL-3.0
					</a>
					, per comprovar la separació de les paraules seleccionades i separar
					les paraules extra.
				</p>
			</section>
			<section className="space-y-3 text-sm leading-relaxed">
				<h3 className="text-base font-semibold">I les pistes?</h3>
				<p>
					Les pistes automàtiques es generen amb intel·ligència artificial a
					partir de les definicions del{" "}
					<a href="https://ca.wiktionary.org/" className="text-link">
						Viccionari
					</a>
					, publicades sota la llicència{" "}
					<a
						href="https://creativecommons.org/licenses/by-sa/4.0/deed.ca"
						className="text-link"
					>
						CC BY-SA 4.0
					</a>
					. També pots demanar pistes a altres jugadors.
				</p>
			</section>
			<p className="text-sm leading-relaxed">
				Garbuix és un joc de codi obert. Pots consultar el codi font a{" "}
				<a href="https://github.com/rogerclotet/garbuix" className="text-link">
					GitHub
				</a>
				.
			</p>
			<footer className="space-y-4 border-t border-border/40 pt-5 text-muted-foreground">
				<div className="space-y-2 text-sm text-foreground/80">
					<p className="font-medium">Un joc de Roger Clotet</p>
					<p className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<a href="https://clotet.dev" className="text-link">
							clotet.dev
						</a>
						<span aria-hidden>·</span>
						<a href="mailto:roger@clotet.dev" className="text-link">
							roger@clotet.dev
						</a>
					</p>
					<p className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<Link to="/privacitat" className="text-link">
							Privacitat
						</Link>
						<span aria-hidden>·</span>
						<Link to="/condicions" className="text-link">
							Condicions d'ús
						</Link>
					</p>
				</div>
				<p className="text-xs">
					Versió <code className="break-all select-all">{APP_RELEASE}</code>
				</p>
			</footer>
		</div>
	);
}
