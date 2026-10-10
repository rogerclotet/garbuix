import { captureException } from "@sentry/tanstackstart-react";
import { getRouteApi } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { GoogleIcon } from "@/components/sign-in/google-icon";
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
import type { SignInMethod } from "@/lib/sign-in-methods";

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

// Better Auth hands back HTTP failures instead of throwing them, so a server
// fault has to be reported by hand or it never reaches error tracking.
function reportServerFault(action: string, error: AuthError): void {
	if (!error?.status || error.status < 500) return;
	captureException(new Error(`${action} failed with status ${error.status}`));
}

// The name a brand-new account made with an emailed code starts with, so a
// guest keeps the name they already have on the leaderboard. Existing accounts
// ignore it.
function currentGuestName(): string | undefined {
	try {
		return getOrCreateAnonIdentity().name;
	} catch (caught) {
		// Blocked storage must not stop the sign-in: the account just starts
		// with a generated name.
		captureException(caught);
		return undefined;
	}
}

export function SignInDialog() {
	const open = useSignInOpen();
	const { signInMethods } = rootRoute.useLoaderData();
	const [verifying, setVerifying] = useState(false);

	const handleOpenChange = (next: boolean) => {
		// Escape must not dismiss the dialog while a code is being checked: a
		// wrong code would fail with nowhere to say so.
		if (!next && verifying) return;
		setSignInOpen(next);
	};

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-sm">
				{/* Remounted on every open so a half-finished code step never
				    greets the player the next time. */}
				{open ? (
					<SignInDialogBody
						methods={signInMethods}
						onVerifyingChange={setVerifying}
					/>
				) : null}
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function SignInDialogBody({
	methods,
	onVerifyingChange,
}: {
	methods: SignInMethod[];
	onVerifyingChange: (verifying: boolean) => void;
}) {
	const [step, setStep] = useState<Step>({ kind: "choose" });
	const googleEnabled = methods.includes("google");
	const emailEnabled = methods.includes("email");

	if (step.kind === "code") {
		return (
			<CodeStep
				email={step.email}
				onBack={() => setStep({ kind: "choose" })}
				onVerifyingChange={onVerifyingChange}
			/>
		);
	}

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle className="text-base">
					Entra a Garbuix
				</AlertDialogTitle>
				<AlertDialogDescription>
					Desa la ratxa i juga des de qualsevol dispositiu.
				</AlertDialogDescription>
			</AlertDialogHeader>

			{methods.length === 0 ? (
				<p className="text-sm text-muted-foreground font-ui">
					Ara mateix no es pot iniciar la sessió. Torna-ho a provar més tard.
				</p>
			) : null}

			{googleEnabled ? <GoogleButton /> : null}

			{googleEnabled && emailEnabled ? (
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

function GoogleButton() {
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);

	const handleClick = async () => {
		setPending(true);
		setFailed(false);
		try {
			const result = await authClient.signIn.social({
				provider: "google",
				callbackURL: window.location.href,
			});
			if (result.error) {
				reportServerFault("Google sign-in", result.error);
				setFailed(true);
				setPending(false);
			}
			// On success the browser is already leaving for Google, so the
			// button stays busy until the page unloads.
		} catch (caught) {
			captureException(caught);
			setFailed(true);
			setPending(false);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<Button
				type="button"
				variant="outline"
				className="h-11 w-full gap-2"
				disabled={pending}
				onClick={handleClick}
			>
				<GoogleIcon />
				Continua amb Google
			</Button>
			{failed ? (
				<p role="alert" className="text-sm text-destructive font-ui">
					No s'ha pogut connectar amb Google. Torna-ho a provar.
				</p>
			) : null}
		</div>
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
				reportServerFault("Sending the sign-in code", result.error);
				setError(describeSendError(result.error));
				return;
			}
			onSent(trimmed);
		} catch (caught) {
			captureException(caught);
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

function CodeStep({
	email,
	onBack,
	onVerifyingChange,
}: {
	email: string;
	onBack: () => void;
	onVerifyingChange: (verifying: boolean) => void;
}) {
	const inputId = useId();
	const errorId = useId();
	const [code, setCode] = useState("");
	const [verifying, setVerifyingState] = useState(false);
	const [resending, setResending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const setVerifying = (next: boolean) => {
		setVerifyingState(next);
		onVerifyingChange(next);
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (code.length !== CODE_LENGTH) {
			setError(`El codi té ${CODE_LENGTH} xifres.`);
			return;
		}
		setVerifying(true);
		setError(null);
		setNotice(null);
		try {
			const result = await authClient.signIn.emailOtp({
				email,
				otp: code,
				name: currentGuestName(),
			});
			if (result.error) {
				reportServerFault("Verifying the sign-in code", result.error);
				setError(describeVerifyError(result.error));
				setVerifying(false);
				return;
			}
			// A full reload lands the player exactly where an OAuth redirect
			// would: the session is read on the server and the guest's progress
			// is imported. The step stays busy until the page unloads.
			window.location.reload();
		} catch (caught) {
			captureException(caught);
			setError(describeVerifyError(null));
			setVerifying(false);
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
				reportServerFault("Resending the sign-in code", result.error);
				setError(describeSendError(result.error));
				return;
			}
			setCode("");
			setNotice("T'hem enviat un codi nou.");
		} catch (caught) {
			captureException(caught);
			setError(describeSendError(null));
		} finally {
			setResending(false);
		}
	};

	const busy = verifying || resending;

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle className="text-base">
					Escriu el codi
				</AlertDialogTitle>
				<AlertDialogDescription>
					<span className="block">
						T'hem enviat un codi de {CODE_LENGTH} xifres a{" "}
						<strong className="font-medium text-foreground break-all">
							{email}
						</strong>
					</span>
					<span className="mt-2 block">
						Si no el trobes, mira a la carpeta de correu brossa.
					</span>
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
					{verifying ? "Entrant..." : "Entra"}
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
				<AlertDialogCancel disabled={verifying}>Ara no</AlertDialogCancel>
			</AlertDialogFooter>
		</>
	);
}
