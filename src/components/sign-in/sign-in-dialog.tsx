import { getRouteApi } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ProviderIcon } from "@/components/sign-in/provider-icons";
import {
	setSignInOpen,
	useSignInOpen,
} from "@/components/sign-in/sign-in-store";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getOrCreateAnonIdentity } from "@/lib/anon-identity";
import { authClient } from "@/lib/auth-client";
import {
	type SignInMethod,
	SOCIAL_SIGN_IN_LABELS,
	type SocialSignInMethod,
} from "@/lib/sign-in-methods";

const rootRoute = getRouteApi("__root__");

const CODE_LENGTH = 6;

type Step = { kind: "choose" } | { kind: "code"; email: string };

type AuthError = { code?: string; status?: number } | null | undefined;

function describeSendError(error: AuthError): string {
	if (error?.status === 429) {
		return "Has demanat massa codis. Espera un minut i torna-ho a provar.";
	}
	if (error?.code === "INVALID_EMAIL") {
		return "Aquesta adreça de correu no és vàlida.";
	}
	return "No t'hem pogut enviar el codi. Torna-ho a provar.";
}

function describeVerifyError(error: AuthError): string {
	switch (error?.code) {
		case "OTP_EXPIRED":
			return "El codi ha caducat. Demana'n un de nou.";
		case "TOO_MANY_ATTEMPTS":
			return "Massa intents. Demana un codi nou.";
		case "INVALID_OTP":
			return "El codi no és correcte.";
	}
	if (error?.status === 429) {
		return "Massa intents. Espera un minut i torna-ho a provar.";
	}
	return "No s'ha pogut iniciar la sessió. Torna-ho a provar.";
}

// The name a brand-new account starts with, so a guest keeps the name they
// already have on the leaderboard. Existing accounts ignore it.
function currentGuestName(): string | undefined {
	try {
		return getOrCreateAnonIdentity().name;
	} catch {
		return undefined;
	}
}

export function SignInDialog() {
	const open = useSignInOpen();
	const { signInMethods } = rootRoute.useLoaderData();

	return (
		<AlertDialog open={open} onOpenChange={setSignInOpen}>
			<AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-sm">
				{/* Remounted on every open so a half-finished code step never
				    greets the player the next time. */}
				{open ? <SignInDialogBody methods={signInMethods} /> : null}
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function SignInDialogBody({ methods }: { methods: SignInMethod[] }) {
	const [step, setStep] = useState<Step>({ kind: "choose" });
	const socialMethods = methods.filter(
		(method): method is SocialSignInMethod => method !== "email",
	);
	const emailEnabled = methods.includes("email");

	if (step.kind === "code") {
		return (
			<CodeStep email={step.email} onBack={() => setStep({ kind: "choose" })} />
		);
	}

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle className="text-base">
					Entra a Garbuix
				</AlertDialogTitle>
				<AlertDialogDescription>
					Desa la ratxa, juga des de qualsevol dispositiu i apareix a la
					classificació amb el teu nom.
				</AlertDialogDescription>
			</AlertDialogHeader>

			{methods.length === 0 ? (
				<p className="text-sm text-muted-foreground font-ui">
					Ara mateix no es pot iniciar la sessió. Torna-ho a provar més tard.
				</p>
			) : null}

			{socialMethods.length > 0 ? (
				<div className="flex flex-col gap-2">
					{socialMethods.map((provider) => (
						<SocialButton key={provider} provider={provider} />
					))}
				</div>
			) : null}

			{socialMethods.length > 0 && emailEnabled ? (
				<div className="flex items-center gap-3 text-xs text-muted-foreground font-ui">
					<div className="h-px flex-1 bg-border" aria-hidden />
					<span>o amb el teu correu</span>
					<div className="h-px flex-1 bg-border" aria-hidden />
				</div>
			) : null}

			{emailEnabled ? (
				<EmailStep onSent={(email) => setStep({ kind: "code", email })} />
			) : null}

			<AlertDialogFooter>
				<AlertDialogCancel>Ara no</AlertDialogCancel>
			</AlertDialogFooter>
		</>
	);
}

function SocialButton({ provider }: { provider: SocialSignInMethod }) {
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	const label = SOCIAL_SIGN_IN_LABELS[provider];

	const handleClick = async () => {
		setPending(true);
		setFailed(false);
		try {
			const result = await authClient.signIn.social({
				provider,
				callbackURL: window.location.href,
				additionalData: { guestName: currentGuestName() },
			});
			if (result.error) {
				setFailed(true);
				setPending(false);
			}
			// On success the browser is already leaving for the provider, so the
			// button stays busy until the page unloads.
		} catch {
			setFailed(true);
			setPending(false);
		}
	};

	return (
		<>
			<Button
				type="button"
				variant="outline"
				className="h-11 w-full gap-2"
				disabled={pending}
				onClick={handleClick}
			>
				<ProviderIcon provider={provider} />
				Continua amb {label}
			</Button>
			{failed ? (
				<p role="alert" className="text-sm text-destructive font-ui">
					No s'ha pogut connectar amb {label}. Torna-ho a provar.
				</p>
			) : null}
		</>
	);
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
	const inputId = useId();
	const errorId = useId();
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = email.trim();
		if (!trimmed) {
			setError("Escriu la teva adreça de correu.");
			return;
		}
		setPending(true);
		setError(null);
		try {
			const result = await authClient.emailOtp.sendVerificationOtp({
				email: trimmed,
				type: "sign-in",
			});
			if (result.error) {
				setError(describeSendError(result.error));
				return;
			}
			onSent(trimmed);
		} catch {
			setError(describeSendError(null));
		} finally {
			setPending(false);
		}
	};

	return (
		<form className="flex flex-col gap-2" onSubmit={handleSubmit} noValidate>
			<label htmlFor={inputId} className="sr-only">
				Adreça de correu
			</label>
			<Input
				id={inputId}
				type="email"
				inputMode="email"
				autoComplete="email"
				placeholder="nom@exemple.cat"
				className="h-11"
				value={email}
				onChange={(event) => setEmail(event.target.value)}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
				disabled={pending}
			/>
			{error ? (
				<p
					id={errorId}
					role="alert"
					className="text-sm text-destructive font-ui"
				>
					{error}
				</p>
			) : null}
			<Button type="submit" className="h-11 w-full gap-2" disabled={pending}>
				<Mail className="size-4" />
				{pending ? "Enviant..." : "Envia'm un codi"}
			</Button>
		</form>
	);
}

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
	const inputId = useId();
	const errorId = useId();
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [resending, setResending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const [signedIn, setSignedIn] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (code.length !== CODE_LENGTH) {
			setError(`El codi té ${CODE_LENGTH} xifres.`);
			return;
		}
		setPending(true);
		setError(null);
		setNotice(null);
		try {
			const result = await authClient.signIn.emailOtp({
				email,
				otp: code,
				name: currentGuestName(),
			});
			if (result.error) {
				setError(describeVerifyError(result.error));
				setPending(false);
				return;
			}
			setSignedIn(true);
			// A full reload lands the player exactly where an OAuth redirect
			// would: the session is read on the server and the guest's progress
			// is imported.
			window.location.reload();
		} catch {
			setError(describeVerifyError(null));
			setPending(false);
		}
	};

	const handleResend = async () => {
		setResending(true);
		setError(null);
		setNotice(null);
		try {
			const result = await authClient.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});
			if (result.error) {
				setError(describeSendError(result.error));
				return;
			}
			setCode("");
			setNotice("T'hem enviat un codi nou.");
		} catch {
			setError(describeSendError(null));
		} finally {
			setResending(false);
		}
	};

	const busy = pending || resending || signedIn;

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle className="text-base">
					Escriu el codi
				</AlertDialogTitle>
				<AlertDialogDescription>
					T'hem enviat un codi de {CODE_LENGTH} xifres a{" "}
					<strong className="font-medium text-foreground break-all">
						{email}
					</strong>
					. Si no el trobes, mira a la carpeta de correu brossa.
				</AlertDialogDescription>
			</AlertDialogHeader>

			<form className="flex flex-col gap-2" onSubmit={handleSubmit} noValidate>
				<label htmlFor={inputId} className="sr-only">
					Codi
				</label>
				<Input
					id={inputId}
					type="text"
					inputMode="numeric"
					autoComplete="one-time-code"
					pattern="[0-9]*"
					maxLength={CODE_LENGTH}
					placeholder="123456"
					className="h-11 text-center text-lg tracking-[0.4em] tabular-nums md:text-lg"
					value={code}
					onChange={(event) =>
						setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
					}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? errorId : undefined}
					disabled={busy}
					autoFocus
				/>
				{error ? (
					<p
						id={errorId}
						role="alert"
						className="text-sm text-destructive font-ui"
					>
						{error}
					</p>
				) : null}
				{notice ? (
					<p role="status" className="text-sm text-muted-foreground font-ui">
						{notice}
					</p>
				) : null}
				<Button type="submit" className="h-11 w-full" disabled={busy}>
					{pending || signedIn ? "Entrant..." : "Entra"}
				</Button>
			</form>

			<div className="flex items-center justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="gap-1"
					onClick={onBack}
					disabled={busy}
				>
					<ArrowLeft className="size-3.5" />
					Canvia el correu
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleResend}
					disabled={busy}
				>
					{resending ? "Enviant..." : "Torna a enviar el codi"}
				</Button>
			</div>

			<AlertDialogFooter>
				<AlertDialogCancel disabled={signedIn}>Ara no</AlertDialogCancel>
			</AlertDialogFooter>
		</>
	);
}
