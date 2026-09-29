import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SERVICE_WORKER_PATH = "public/sw.js";
const PRECACHE_URLS_PATTERN = /const PRECACHE_URLS = \[([^\]]*)\]/;

// The precache list is authored in the worker, so read it back out instead of
// mirroring it here: a mirror silently drifts, and the drift only shows up as
// clients stuck on an old offline page or icon.
function resolvePrecacheEntry(source: string, entry: string): string {
	const literal = entry.match(/^"([^"]+)"$/);
	if (literal) {
		return literal[1];
	}

	if (!/^[A-Za-z_$][\w$]*$/.test(entry)) {
		throw new Error(
			`Unsupported PRECACHE_URLS entry in ${SERVICE_WORKER_PATH}: ${entry}`,
		);
	}

	const binding = source.match(new RegExp(`const ${entry} = "([^"]+)"`));
	if (!binding) {
		throw new Error(
			`Could not resolve PRECACHE_URLS entry ${entry} in ${SERVICE_WORKER_PATH}`,
		);
	}

	return binding[1];
}

function readPrecachedPaths(source: string): string[] {
	const match = source.match(PRECACHE_URLS_PATTERN);
	if (!match) {
		throw new Error(`Could not find PRECACHE_URLS in ${SERVICE_WORKER_PATH}`);
	}

	return match[1]
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => `public${resolvePrecacheEntry(source, entry)}`);
}

// A release only forces a client-visible service worker swap when the worker
// itself, or one of the assets it precaches and then serves without
// revalidation, changes. Everything else reaches the client through the
// worker's network-first navigation on the next full load, so hashing this
// separately is what lets the app skip the update prompt for ordinary releases.
async function computeServiceWorkerHash(): Promise<string> {
	const source = await readFile(
		resolve(process.cwd(), SERVICE_WORKER_PATH),
		"utf8",
	);
	const precachedPaths = readPrecachedPaths(source).sort();

	const hash = createHash("sha256");
	hash.update(source);
	hash.update("\0");

	for (const path of precachedPaths) {
		hash.update(path);
		hash.update("\0");
		hash.update(await readFile(resolve(process.cwd(), path)));
		hash.update("\0");
	}

	return hash.digest("hex").slice(0, 16);
}

function resolveSentryRelease(): string {
	const configured = process.env.SENTRY_RELEASE?.trim();
	if (configured) return configured;

	try {
		return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		// Docker and source archives may not contain Git metadata.
		return "dev";
	}
}

const serviceWorkerVersion = await computeServiceWorkerHash();
const sentryRelease = resolveSentryRelease();
const manifestPath = resolve(process.cwd(), "public/version.json");

await mkdir(dirname(manifestPath), { recursive: true });
// Tab-indented to match the Biome formatter, which lints public/ and would
// otherwise fail `pnpm check` on any working tree where a build has run.
await writeFile(
	manifestPath,
	`${JSON.stringify({ serviceWorkerVersion, sentryRelease }, null, "\t")}\n`,
	"utf8",
);

console.log(
	`Wrote build version manifest to ${manifestPath}: service worker ${serviceWorkerVersion}, Sentry release ${sentryRelease}`,
);
