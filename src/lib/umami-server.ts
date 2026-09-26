import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { getServerObservabilityConfig } from "@/lib/observability-config";
import {
	toUmamiPath,
	toUmamiProperties,
	umamiEventName,
} from "@/lib/umami-events";

const umamiMessageSchema = z.object({
	type: z.literal("event"),
	payload: z.object({
		url: z.string(),
		name: umamiEventName.optional(),
		data: z.record(z.string(), z.unknown()).optional(),
	}),
});

type UmamiMessage = z.infer<typeof umamiMessageSchema>;
type UmamiConfig = NonNullable<
	ReturnType<typeof getServerObservabilityConfig>["umami"]
>;

async function sendUmamiMessage(
	config: UmamiConfig,
	message: UmamiMessage,
	requestHeaders?: Headers,
) {
	const headers = new Headers({ "Content-Type": "application/json" });
	// Background jobs have no visitor. HTTP events preserve the inputs Umami
	// uses for anonymous sessions, without account or PostHog identifiers.
	headers.set("User-Agent", "Mozilla/5.0 (compatible; Garbuix analytics)");
	for (const name of [
		"user-agent",
		"x-forwarded-for",
		"x-real-ip",
		"cf-connecting-ip",
		"x-umami-cache",
	]) {
		const value = requestHeaders?.get(name);
		if (value) headers.set(name, value);
	}

	return fetch(`${config.host.replace(/\/+$/, "")}/api/send`, {
		method: "POST",
		headers,
		redirect: "error",
		signal: AbortSignal.timeout(5000),
		body: JSON.stringify({
			type: "event",
			payload: {
				website: config.websiteId,
				url: toUmamiPath(message.payload.url),
				name:
					message.payload.name === "$pageview"
						? undefined
						: message.payload.name,
				data: toUmamiProperties(message.payload.data),
			},
		}),
	});
}

export async function proxyUmamiRequest(request: Request) {
	const config = getServerObservabilityConfig().umami;
	if (!config) return new Response(null, { status: 404 });

	const message = umamiMessageSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!message.success) return new Response(null, { status: 400 });

	try {
		const response = await sendUmamiMessage(
			config,
			message.data,
			request.headers,
		);
		if (!response.ok) {
			await response.body?.cancel();
			return new Response(null, { status: 502 });
		}
		// Return only Umami's opaque cache token, never upstream cookies or
		// arbitrary response fields. The browser keeps this token in memory.
		const result = z
			.object({ cache: z.string().optional() })
			.safeParse(await response.json().catch(() => null));
		return Response.json(result.success ? result.data : {}, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch {
		// Do not report analytics transport failures through analytics itself.
		return new Response(null, { status: 502 });
	}
}

export async function captureUmamiServerEvent(options: {
	event: string;
	properties?: Record<string, unknown>;
}) {
	const config = getServerObservabilityConfig().umami;
	if (!config) return;

	const event = umamiEventName.safeParse(options.event);
	if (!event.success) return;
	let requestHeaders: Headers | undefined;
	try {
		requestHeaders = getRequestHeaders();
	} catch {
		// Scheduled jobs run outside an HTTP request.
	}

	try {
		const response = await sendUmamiMessage(
			config,
			{
				type: "event",
				payload: {
					name: event.data,
					url: "/server",
					data: options.properties,
				},
			},
			requestHeaders,
		);
		await response.body?.cancel();
	} catch {
		// A failed analytics request must not reject a server action.
	}
}
