const CACHE_VERSION =
	new URL(self.location.href).searchParams.get("v") ?? "dev";
const STATIC_CACHE = `paraules-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `paraules-runtime-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = "/offline.html";

const PRECACHE_URLS = [
	OFFLINE_FALLBACK_URL,
	"/manifest.json",
	"/icons/favicon-196.png",
	"/icons/apple-icon-180.png",
	"/icons/manifest-icon-192.maskable.png",
	"/icons/manifest-icon-512.maskable.png",
];

const CACHEABLE_DESTINATIONS = new Set([
	"style",
	"script",
	"worker",
	"font",
	"image",
	"manifest",
]);

// Mirrors POSTHOG_PROXY_PATH in src/lib/posthog-proxy.ts. Because analytics is
// same-origin through that proxy, its script-tag requests would otherwise land
// in the asset cache below.
const POSTHOG_PROXY_PREFIX = "/ph/";

function isCacheableAssetRequest(request, url) {
	if (CACHEABLE_DESTINATIONS.has(request.destination)) {
		return true;
	}

	return (
		url.pathname === "/favicon.ico" ||
		url.pathname === "/manifest.json" ||
		url.pathname.startsWith("/icons/")
	);
}

function shouldCacheResponse(response) {
	return response.ok || response.type === "opaque";
}

function isEventStreamRequest(request) {
	return (request.headers.get("accept") ?? "").includes("text/event-stream");
}

// Serve the cached copy immediately, then refresh it in the background. A plain
// cache-first strategy pins every unhashed URL to whatever body was cached
// first, for as long as the cache name lives.
async function staleWhileRevalidate(event, request) {
	const cache = await caches.open(RUNTIME_CACHE);
	const cached = await cache.match(request);

	const revalidation = fetch(request).then((response) => {
		if (shouldCacheResponse(response)) {
			const copy = response.clone();
			// A failed write (quota, eviction) must not fail the request itself.
			event.waitUntil(cache.put(request, copy).catch(() => {}));
		}

		return response;
	});

	if (!cached) {
		return revalidation;
	}

	// A failed refresh just leaves the previous entry in place.
	event.waitUntil(revalidation.catch(() => {}));
	return cached;
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
	);
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") {
		self.skipWaiting();
	}
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		Promise.all([
			self.clients.claim(),
			caches
				.keys()
				.then((keys) =>
					Promise.all(
						keys
							.filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
							.map((key) => caches.delete(key)),
					),
				),
		]),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;

	if (request.method !== "GET") {
		return;
	}

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) {
		return;
	}

	// Never proxy a server-sent event stream. The browser is free to terminate an
	// idle worker mid-stream, and any abort surfaces as an opaque "ServiceWorker
	// intercepted the request and encountered an unexpected error" instead of the
	// clean failure EventSource knows how to reconnect from.
	if (isEventStreamRequest(request)) {
		return;
	}

	// Feature-flag config and analytics are always live. Caching
	// /ph/array/<token>/config.js pins its `hasFeatureFlags` value, and a stale
	// `false` stops posthog-js from ever loading flags on that device.
	if (url.pathname.startsWith(POSTHOG_PROXY_PREFIX)) {
		return;
	}

	if (url.pathname === "/version.json") {
		event.respondWith(fetch(request, { cache: "no-store" }));
		return;
	}

	if (url.pathname.startsWith("/api/")) {
		event.respondWith(fetch(request, { cache: "no-store" }));
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (shouldCacheResponse(response)) {
						const copy = response.clone();
						event.waitUntil(
							caches
								.open(RUNTIME_CACHE)
								.then((cache) => cache.put(request, copy)),
						);
					}

					return response;
				})
				.catch(async () => {
					const cachedNavigation = await caches.match(request);
					if (cachedNavigation) {
						return cachedNavigation;
					}

					return (
						(await caches.match(OFFLINE_FALLBACK_URL)) ||
						new Response("Offline", {
							status: 503,
							statusText: "Offline",
							headers: {
								"Content-Type": "text/plain; charset=utf-8",
							},
						})
					);
				}),
		);
		return;
	}

	if (!isCacheableAssetRequest(request, url)) {
		return;
	}

	event.respondWith(
		caches.open(STATIC_CACHE).then(async (staticCache) => {
			// The precache is keyed by CACHE_VERSION and rotates with it, so those
			// entries need no revalidation.
			const precached = await staticCache.match(request);
			if (precached) {
				return precached;
			}

			return staleWhileRevalidate(event, request);
		}),
	);
});
