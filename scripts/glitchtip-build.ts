import { execFileSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import SentryCli from "@sentry/cli";
import type { Plugin } from "vite";

export function glitchtipServerSourceMaps(): Plugin {
	const intermediateDir = `${resolve("node_modules/.nitro/vite/services")}/`;
	return {
		name: "glitchtip-server-source-maps",
		apply: "build",
		applyToEnvironment: (environment) => environment.name === "nitro",
		async load(id) {
			if (!id.startsWith(intermediateDir) || !id.endsWith(".js")) return null;
			try {
				// Nitro rebundles Start's SSR output. Feed its input maps to Vite so
				// final stack traces resolve to TS/TSX instead of intermediate JS.
				return {
					code: await readFile(id, "utf8"),
					map: await readFile(`${id}.map`, "utf8"),
				};
			} catch (error) {
				if (
					error instanceof Error &&
					"code" in error &&
					error.code === "ENOENT"
				)
					return null;
				throw error;
			}
		},
	};
}

export function glitchtipClientSourceMaps(): Plugin {
	return {
		name: "glitchtip-client-source-maps",
		apply: "build",
		applyToEnvironment: (environment) => environment.name === "client",
		writeBundle: {
			order: "post",
			sequential: true,
			async handler() {
				const publicDir = resolve(".output/public");
				const archiveDir = resolve(".output/sourcemaps/client");
				// Nitro computes static asset sizes and ETags after the client build.
				// Inject before that happens, and remove maps before it indexes them.
				execFileSync(
					SentryCli.getPath(),
					["sourcemaps", "inject", "--quiet", join(publicDir, "assets")],
					{ stdio: "inherit" },
				);
				await rm(archiveDir, { recursive: true, force: true });
				await archiveMaps(publicDir, publicDir, archiveDir);
			},
		},
	};
}

async function archiveMaps(
	directory: string,
	publicDir: string,
	archiveDir: string,
): Promise<void> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const source = join(directory, entry.name);
		if (entry.isDirectory()) {
			await archiveMaps(source, publicDir, archiveDir);
		} else if (entry.name.endsWith(".map")) {
			const target = join(archiveDir, relative(publicDir, source));
			await mkdir(dirname(target), { recursive: true });
			await rename(source, target);
			await copyFile(source.slice(0, -4), target.slice(0, -4));
		}
	}
}
