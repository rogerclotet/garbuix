import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// This version string is the only thing that invalidates a client's service
// worker: it becomes the `?v=` on the registered script URL and the suffix on
// every cache name. If it fails to change, browsers keep the installed worker
// and its runtime cache forever, so anything that alters what a client should
// re-download has to be part of the hash. Hashing only the precached assets is
// what previously froze every client at the same version across app releases.
const HASHED_ROOTS = ["src", "public"];
const HASHED_FILES = ["package.json", "pnpm-lock.yaml", "vite.config.ts"];

// Build artifacts. Hashing them would make the version depend on whether a
// previous build already ran in this working directory: version.json is written
// by this script, and the dictionaries are downloaded by the prebuild step that
// runs after it.
const EXCLUDED_PATHS = new Set([
	"public/version.json",
	"src/data/catalan-words.json",
	"src/data/catalan-guess-words.json",
]);

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

async function collectFiles(directory: string): Promise<string[]> {
	const entries = await readdir(resolve(process.cwd(), directory), {
		withFileTypes: true,
	});
	const files: string[] = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await collectFiles(path)));
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		files.push(path);
	}

	return files;
}

async function computeContentHash(): Promise<string> {
	const discovered = await Promise.all(HASHED_ROOTS.map(collectFiles));

	// Directory listing order is not guaranteed, so sort to keep the hash stable
	// across machines and filesystems.
	const paths = [...discovered.flat(), ...HASHED_FILES]
		.filter((path) => !EXCLUDED_PATHS.has(path))
		.sort();

	const hash = createHash("sha256");
	for (const path of paths) {
		hash.update(path);
		hash.update("\0");
		hash.update(await readFile(resolve(process.cwd(), path)));
		hash.update("\0");
	}

	return hash.digest("hex").slice(0, 16);
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

const buildVersion = process.env.APP_VERSION ?? (await computeContentHash());
const serviceWorkerVersion = await computeServiceWorkerHash();
const manifestPath = resolve(process.cwd(), "public/version.json");

await mkdir(dirname(manifestPath), { recursive: true });
// Tab-indented to match the Biome formatter, which lints public/ and would
// otherwise fail `pnpm check` on any working tree where a build has run.
await writeFile(
	manifestPath,
	`${JSON.stringify({ version: buildVersion, serviceWorkerVersion }, null, "\t")}\n`,
	"utf8",
);

console.log(
	`Wrote build version manifest to ${manifestPath}: ${buildVersion} (service worker ${serviceWorkerVersion})`,
);
