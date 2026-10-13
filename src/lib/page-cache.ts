// public/sw.js keeps each page it navigates to in this cache, next to the
// assets, so the app can still open offline.
const RUNTIME_CACHE_PREFIX = "paraules-runtime-";

function isPageRequest(request: Request) {
	// Every cached asset path ends in a file extension: hashed bundles, fonts,
	// icons, the favicon and the manifest. Pages never do.
	return !/\.[a-z0-9]+$/i.test(new URL(request.url).pathname);
}

// A page opened offline renders the account it was rendered for, since
// nobody can say otherwise until the network returns. Once the player signs
// out, those copies must not bring the account back.
export async function forgetCachedPages() {
	if (typeof caches === "undefined") return;
	const names = await caches.keys();
	await Promise.all(
		names
			.filter((name) => name.startsWith(RUNTIME_CACHE_PREFIX))
			.map(async (name) => {
				const cache = await caches.open(name);
				const requests = await cache.keys();
				await Promise.all(
					requests
						.filter(isPageRequest)
						.map((request) => cache.delete(request)),
				);
			}),
	);
}
