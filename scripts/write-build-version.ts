import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PRECACHE_FILES = [
	"public/sw.js",
	"public/offline.html",
	"public/manifest.json",
	"public/icons/favicon-196.png",
	"public/icons/apple-icon-180.png",
	"public/icons/manifest-icon-192.maskable.png",
	"public/icons/manifest-icon-512.maskable.png",
];

async function computeContentHash() {
	const hash = createHash("sha256");
	for (const path of PRECACHE_FILES) {
		const contents = await readFile(resolve(process.cwd(), path));
		hash.update(path);
		hash.update("\0");
		hash.update(contents);
		hash.update("\0");
	}
	return hash.digest("hex").slice(0, 16);
}

const buildVersion = process.env.APP_VERSION ?? (await computeContentHash());
const manifestPath = resolve(process.cwd(), "public/version.json");

await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(
	manifestPath,
	`${JSON.stringify({ version: buildVersion }, null, 2)}\n`,
	"utf8",
);

console.log(`Wrote build version manifest to ${manifestPath}: ${buildVersion}`);
