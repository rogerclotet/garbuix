const CACHE_VERSION = "v2";
const STATIC_CACHE = `paraules-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `paraules-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
	"/",
	"/manifest.json",
	"/icons/favicon-196.png",
	"/icons/apple-icon-180.png",
	"/icons/manifest-icon-192.maskable.png",
	"/icons/manifest-icon-512.maskable.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
	);
	self.skipWaiting();
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

	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const copy = response.clone();
					event.waitUntil(
						caches
							.open(RUNTIME_CACHE)
							.then((cache) => cache.put(request, copy)),
					);
					return response;
				})
				.catch(() =>
					caches.match(request).then((cached) => cached || caches.match("/")),
				),
		);
		return;
	}

	event.respondWith(
		caches.match(request).then((cached) => {
			if (cached) {
				return cached;
			}

			return fetch(request).then((response) => {
				const copy = response.clone();
				event.waitUntil(
					caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)),
				);
				return response;
			});
		}),
	);
});
