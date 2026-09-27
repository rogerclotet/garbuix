import { type UsageEvent, usageEventSchema } from "./usage-events";

const MAX_BODY_BYTES = 512;

export async function handleUsageRequest(
	request: Request,
	options: {
		enabled: boolean;
		increment: (event: UsageEvent) => Promise<void>;
	},
) {
	const response = (status: number) =>
		new Response(null, { status, headers: { "Cache-Control": "no-store" } });
	if (!options.enabled) return response(204);
	if (request.method !== "POST") return response(405);
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return response(403);
	if (
		request.headers.get("content-type")?.split(";")[0] !== "application/json" ||
		request.headers.has("content-encoding")
	)
		return response(415);
	if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
		return response(413);
	const reader = request.body?.getReader();
	if (!reader) return response(400);
	try {
		const chunks: Uint8Array[] = [];
		let bytes = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_BODY_BYTES) {
				await reader.cancel();
				return response(413);
			}
			chunks.push(value);
		}
		let data: unknown;
		try {
			data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		} catch {
			return response(400);
		}
		const parsed = usageEventSchema.safeParse(data);
		if (!parsed.success) return response(400);
		await options.increment(parsed.data);
		return response(204);
	} catch {
		// Never report request bodies, headers, or database query parameters to
		// diagnostics. Analytics is best-effort and cannot interrupt the game.
		return response(503);
	} finally {
		reader.releaseLock();
	}
}
