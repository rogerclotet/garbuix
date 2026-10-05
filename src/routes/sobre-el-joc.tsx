import { createFileRoute } from "@tanstack/react-router";
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
						className="underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
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
					Per separar en síl·labes les paraules extra de Garbuix síl·labes, fem
					servir els patrons de{" "}
					<a
						href="https://github.com/jaumeortola/hyphen-ca"
						className="underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
					>
						hyphen-ca
					</a>
					, de Jaume Ortolà, publicats sota la llicència{" "}
					<a
						href="https://github.com/jaumeortola/hyphen-ca/blob/dac10c01eab7132c1ddf4a22e2ea8a3f6ee439ae/LICENSE"
						className="underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
					>
						GPL-3.0
					</a>
					.
				</p>
			</section>
			<section className="space-y-3 text-sm leading-relaxed">
				<h3 className="text-base font-semibold">I les pistes?</h3>
				<p>
					Les pistes automàtiques es generen amb intel·ligència artificial.
					També pots demanar pistes a altres jugadors.
				</p>
			</section>
			<p className="text-sm leading-relaxed">
				Garbuix és un joc de codi obert. Pots consultar el codi font a{" "}
				<a
					href="https://github.com/rogerclotet/garbuix"
					className="underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
				>
					GitHub
				</a>
				.
			</p>
			<footer className="space-y-4 border-t border-border/40 pt-5 text-muted-foreground">
				<div className="space-y-2 text-sm text-foreground/80">
					<p className="font-medium">Un joc de Roger Clotet</p>
					<p className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<a
							href="https://clotet.dev"
							className="underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
						>
							clotet.dev
						</a>
						<span aria-hidden>·</span>
						<a
							href="mailto:roger@clotet.dev"
							className="underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
						>
							roger@clotet.dev
						</a>
					</p>
				</div>
				<p className="text-xs">
					Versió <code className="break-all select-all">{APP_RELEASE}</code>
				</p>
			</footer>
		</div>
	);
}
