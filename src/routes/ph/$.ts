import { createFileRoute } from "@tanstack/react-router";
import { getServerObservabilityConfig } from "@/lib/observability-config";
import { observeServerAction } from "@/lib/observability-server";
import {
	getPostHogProxyHeaders,
	getPostHogProxyResponseHeaders,
	getPostHogProxyTarget,
} from "@/lib/posthog-proxy";

export const Route = createFileRoute("/ph/$")({
	server: {
		handlers: {
			GET: ({ request }) => proxyPostHogRequest(request),
			HEAD: ({ request }) => proxyPostHogRequest(request),
			OPTIONS: ({ request }) => proxyPostHogRequest(request),
			POST: ({ request }) => proxyPostHogRequest(request),
		},
	},
});

async function proxyPostHogRequest(request: Request) {
	return observeServerAction(
		"posthog_proxy",
		async () => {
			const config = getServerObservabilityConfig();
			const posthogHost = config.posthogHost;

			if (!config.posthogKey || !posthogHost) {
				return new Response("PostHog proxy is not configured.", {
					status: 404,
				});
			}

			const targetUrl = getPostHogProxyTarget(request.url, posthogHost);
			const headers = getPostHogProxyHeaders(request.headers, targetUrl);
			const body = shouldForwardBody(request.method)
				? await request.arrayBuffer()
				: undefined;

			const upstreamResponse = await fetch(targetUrl, {
				body,
				headers,
				method: request.method,
				redirect: "manual",
			});

			return new Response(upstreamResponse.body, {
				headers: getPostHogProxyResponseHeaders(upstreamResponse.headers),
				status: upstreamResponse.status,
				statusText: upstreamResponse.statusText,
			});
		},
		{
			properties: {
				method: request.method,
				pathname: new URL(request.url).pathname,
			},
		},
	);
}

function shouldForwardBody(method: string) {
	return method !== "GET" && method !== "HEAD";
}
