export const POSTHOG_PROXY_PATH = "/ph";

// PostHog serves JS SDK assets and remote config (recording conditions,
// feature flags, sampling) from the assets origin. Match the official proxy
// guidance: route /static/ and /array/ there; everything else to the API host.
const POSTHOG_ASSETS_PATH_PREFIXES = [
	`${POSTHOG_PROXY_PATH}/static/`,
	`${POSTHOG_PROXY_PATH}/array/`,
] as const;
const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

export function getPostHogProxyTarget(requestUrl: string, posthogHost: string) {
	const incomingUrl = new URL(requestUrl);
	const upstreamUrl = getUpstreamBaseUrl(incomingUrl.pathname, posthogHost);
	const targetUrl = new URL(upstreamUrl);

	targetUrl.search = incomingUrl.search;
	targetUrl.pathname = joinUrlPaths(
		upstreamUrl.pathname,
		stripPostHogProxyPrefix(incomingUrl.pathname),
	);

	return targetUrl;
}

export function getPostHogProxyHeaders(
	requestHeaders: Headers,
	targetUrl: URL,
) {
	const headers = new Headers(requestHeaders);

	for (const header of HOP_BY_HOP_HEADERS) {
		headers.delete(header);
	}

	headers.delete("content-length");
	headers.set("host", targetUrl.host);

	return headers;
}

export function getPostHogProxyResponseHeaders(responseHeaders: Headers) {
	const headers = new Headers(responseHeaders);

	for (const header of HOP_BY_HOP_HEADERS) {
		headers.delete(header);
	}

	// `fetch` already decoded the upstream body, so the original encoding and
	// length no longer describe what we forward. Leaving them in makes the
	// browser try to decompress plain text (NS_ERROR_INVALID_CONTENT_ENCODING),
	// which breaks reading the /flags response and silently disables feature
	// flags. Drop them and let the runtime set correct values.
	headers.delete("content-encoding");
	headers.delete("content-length");

	return headers;
}

function getUpstreamBaseUrl(pathname: string, posthogHost: string) {
	const upstreamUrl = new URL(posthogHost);

	if (shouldUsePostHogAssetsHost(pathname)) {
		return getPostHogAssetsUrl(upstreamUrl);
	}

	return upstreamUrl;
}

function shouldUsePostHogAssetsHost(pathname: string) {
	return POSTHOG_ASSETS_PATH_PREFIXES.some((prefix) =>
		pathname.startsWith(prefix),
	);
}

function getPostHogAssetsUrl(upstreamUrl: URL) {
	const assetsUrl = new URL(upstreamUrl);

	if (upstreamUrl.hostname.endsWith(".i.posthog.com")) {
		assetsUrl.hostname = upstreamUrl.hostname.replace(
			/\.i\.posthog\.com$/,
			"-assets.i.posthog.com",
		);
		assetsUrl.pathname = "/";
	}

	return assetsUrl;
}

function stripPostHogProxyPrefix(pathname: string) {
	const normalizedPathname = pathname.startsWith(POSTHOG_PROXY_PATH)
		? pathname.slice(POSTHOG_PROXY_PATH.length)
		: pathname;

	if (!normalizedPathname) {
		return "/";
	}

	return normalizedPathname.startsWith("/")
		? normalizedPathname
		: `/${normalizedPathname}`;
}

function joinUrlPaths(basePathname: string, proxiedPathname: string) {
	const normalizedBasePathname =
		basePathname === "/" ? "" : basePathname.replace(/\/+$/, "");
	const normalizedProxyPathname = proxiedPathname.startsWith("/")
		? proxiedPathname
		: `/${proxiedPathname}`;

	return normalizedBasePathname
		? `${normalizedBasePathname}${normalizedProxyPathname}`
		: normalizedProxyPathname;
}
