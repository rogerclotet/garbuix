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
		caches.match(request).then((cached) => {
			if (cached) {
				return cached;
			}

			return fetch(request).then((response) => {
				if (shouldCacheResponse(response)) {
					const copy = response.clone();
					event.waitUntil(
						caches
							.open(RUNTIME_CACHE)
							.then((cache) => cache.put(request, copy)),
					);
				}
				return response;
			});
		}),
	);
});
