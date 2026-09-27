import { type ErrorReport, errorReportSchema } from "./error-report";

const MAX_BYTES = 60_000;

export async function handleErrorReport(
	request: Request,
	send?: (report: ErrorReport) => Promise<void>,
) {
	const response = (status: number) =>
		new Response(null, { status, headers: { "Cache-Control": "no-store" } });
	if (!send) return response(204);
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return response(403);
	if (
		request.headers.get("content-type")?.split(";")[0] !== "application/json" ||
		request.headers.has("content-encoding")
	)
		return response(415);
	if (Number(request.headers.get("content-length")) > MAX_BYTES)
		return response(413);
	const reader = request.body?.getReader();
	if (!reader) return response(400);
	try {
		const chunks: Uint8Array[] = [];
		let size = 0;
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_BYTES) {
				await reader.cancel();
				return response(413);
			}
			chunks.push(value);
		}
		const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		const parsed = errorReportSchema.safeParse(payload);
		if (!parsed.success) return response(400);
		await send(parsed.data);
		return response(204);
	} catch {
		return response(400);
	} finally {
		reader.releaseLock();
	}
}
