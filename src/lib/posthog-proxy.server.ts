import { getServerObservabilityConfig } from "@/lib/observability-config";
import { observeServerAction } from "@/lib/observability-server";
import {
	getPostHogProxyHeaders,
	getPostHogProxyResponseHeaders,
	getPostHogProxyTarget,
} from "@/lib/posthog-proxy";

export async function proxyPostHogRequest(request: Request) {
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
			let body: ArrayBuffer | undefined;
			if (shouldForwardBody(request.method)) {
				try {
					body = await request.arrayBuffer();
				} catch (error) {
					// A browser can leave midway through an analytics upload. Handle
					// that at the body read, before observability records it as a fault.
					if (request.signal.aborted) {
						return new Response(null, { status: 499 });
					}
					throw error;
				}
			}

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
