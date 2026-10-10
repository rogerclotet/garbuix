const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export const SIGN_IN_CODE_TTL_MINUTES = 10;

export type SignInCodeMailer = (email: string, code: string) => Promise<void>;

export function buildSignInCodeEmail(code: string) {
	const subject = `${code} és el teu codi per entrar a Garbuix`;
	const text = [
		"Hola!",
		"",
		`El teu codi per entrar a Garbuix és: ${code}`,
		"",
		`Caduca d'aquí a ${SIGN_IN_CODE_TTL_MINUTES} minuts.`,
		"Si no l'has demanat tu, pots ignorar aquest correu.",
	].join("\n");
	const html = `<!doctype html>
<html lang="ca">
<body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1c1a">
<div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-size:16px">Hola!</p>
<p style="margin:0 0 16px;font-size:16px">El teu codi per entrar a Garbuix és:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
<p style="margin:0;font-size:14px;color:#5c5c58">Caduca d'aquí a ${SIGN_IN_CODE_TTL_MINUTES} minuts. Si no l'has demanat tu, pots ignorar aquest correu.</p>
</div>
</body>
</html>`;
	return { subject, text, html };
}

export function createResendMailer(options: {
	apiKey: string;
	from: string;
	fetchImpl?: typeof fetch;
}): SignInCodeMailer {
	const fetchImpl = options.fetchImpl ?? fetch;
	return async (email, code) => {
		const { subject, text, html } = buildSignInCodeEmail(code);
		const response = await fetchImpl(RESEND_ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${options.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: options.from,
				to: [email],
				subject,
				text,
				html,
			}),
			signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
		});
		if (!response.ok) {
			// Keep the address out of the error: it ends up in error reports.
			throw new Error(`Resend rejected the sign-in email (${response.status})`);
		}
	};
}

// Local development has no mail provider, so the code goes to the server log.
export const logSignInCode: SignInCodeMailer = async (email, code) => {
	console.info(`[auth] sign-in code for ${email}: ${code}`);
};
