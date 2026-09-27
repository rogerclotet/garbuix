import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import remapping from "@jridgewell/remapping";
import {
	createChunkIdComment,
	createChunkIdSnippet,
	createStableChunkId,
	determineChunkIdFromSource,
} from "@posthog/plugin-utils";
import MagicString from "magic-string";

// Prepare final ESM bundles offline. PostHog's CLI uploads these same chunk IDs,
// but its injection command also contacts the release API and requires secrets.
export async function injectPostHogSourceMaps(
	directory: string,
): Promise<void> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "node_modules") await injectPostHogSourceMaps(file);
		} else if (/\.(?:m?js|cjs)\.map$/.test(entry.name)) {
			const sourceFile = file.slice(0, -4);
			const code = await readFile(sourceFile, "utf8");
			if (determineChunkIdFromSource(code)) continue;
			const id = createStableChunkId(code);
			const output = new MagicString(code);
			const prologue = code.match(
				/^(?:#![^\n]*\n)?(?:["']use strict["'];?\s*)?/,
			);
			output.appendLeft(
				prologue?.[0].length ?? 0,
				`${createChunkIdSnippet(id)}\n`,
			);
			output.append(createChunkIdComment(id));
			const map = remapping(
				[
					output
						.generateMap({ hires: true, source: basename(sourceFile) })
						.toString(),
					await readFile(file, "utf8"),
				],
				() => null,
			);
			await writeFile(file, map.toString());
			await writeFile(sourceFile, output.toString());
		}
	}
}
