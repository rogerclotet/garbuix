import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const buildVersion = process.env.APP_VERSION ?? new Date().toISOString();
const manifestPath = resolve(process.cwd(), "public/version.json");

await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(
	manifestPath,
	`${JSON.stringify({ version: buildVersion }, null, 2)}\n`,
	"utf8",
);

console.log(`Wrote build version manifest to ${manifestPath}: ${buildVersion}`);
