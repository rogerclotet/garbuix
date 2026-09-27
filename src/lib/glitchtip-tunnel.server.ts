import { z } from "zod";

const MAX_ENVELOPE_BYTES = 1024 * 1024;
const envelopeHeaderSchema = z.object({ dsn: z.string() });

export async function proxyGlitchTipRequest(
	request: Request,
	dsn: string | undefined,
) {
	if (!dsn) return new Response(null, { status: 404 });
	if (request.headers.get("content-encoding"))
		return new Response(null, { status: 415 });
	if (Number(request.headers.get("content-length")) > MAX_ENVELOPE_BYTES)
		return new Response(null, { status: 413 });

	const reader = request.body?.getReader();
	if (!reader) return new Response(null, { status: 400 });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > MAX_ENVELOPE_BYTES) {
				await reader.cancel();
				return new Response(null, { status: 413 });
			}
			chunks.push(value);
		}
	} catch {
		return new Response(null, { status: 400 });
	} finally {
		reader.releaseLock();
	}

	const body = Buffer.concat(chunks);
	const newline = body.indexOf(10);
	let header: unknown;
	try {
		header = JSON.parse(
			body.subarray(0, newline < 0 ? body.length : newline).toString("utf8"),
		);
	} catch {
		return new Response(null, { status: 400 });
	}
	const parsed = envelopeHeaderSchema.safeParse(header);
	if (!parsed.success) return new Response(null, { status: 400 });
	if (parsed.data.dsn !== dsn) return new Response(null, { status: 403 });

	// Derive the destination ONLY from trusted configuration, never the body.
	const destination = new URL(dsn);
	const projectId = destination.pathname.split("/").pop();
	const prefix = destination.pathname.slice(
		0,
		destination.pathname.lastIndexOf("/"),
	);
	const key = destination.username;
	destination.username = "";
	destination.pathname = `${prefix}/api/${projectId}/envelope/`;
	destination.searchParams.set("sentry_key", key);
	destination.searchParams.set("sentry_version", "7");

	try {
		const upstream = await fetch(destination, {
			method: "POST",
			headers: { "Content-Type": "application/x-sentry-envelope" },
			body,
			redirect: "error",
			signal: AbortSignal.timeout(5000),
		});
		await upstream.body?.cancel();
		const headers = new Headers({ "Cache-Control": "no-store" });
		for (const name of ["retry-after", "x-sentry-rate-limits"]) {
			const value = upstream.headers.get(name);
			if (value) headers.set(name, value);
		}
		return new Response(null, {
			status: upstream.ok ? 200 : upstream.status,
			headers,
		});
	} catch {
		// Reporting a transport failure through this transport would recurse.
		return new Response(null, { status: 502 });
	}
}
