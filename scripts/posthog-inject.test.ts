import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { SourceMap } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInThisContext } from "node:vm";
import { determineChunkIdFromSource } from "@posthog/plugin-utils";
import { build } from "vite";
import { expect, it } from "vitest";
import { buildErrorReport } from "../src/lib/error-report";
import { injectPostHogSourceMaps } from "./posthog-inject";

it("maps real browser and server exceptions through injected chunk IDs to the original TypeScript", async () => {
	const directory = await mkdtemp(join(tmpdir(), "garbuix-maps-"));
	try {
		const entry = join(directory, "original.ts");
		await writeFile(
			entry,
			'const message: string = "Source map check";\nfunction fail() {\n  throw new Error(message);\n}\nfail();\n',
		);
		const output = join(directory, "output");
		await build({
			configFile: false,
			logLevel: "silent",
			build: {
				lib: {
					entry,
					name: "SourceMapCheck",
					formats: ["iife"],
					fileName: () => "fixture.js",
				},
				outDir: output,
				sourcemap: "hidden",
				minify: true,
			},
		});
		await injectPostHogSourceMaps(output);
		const code = await readFile(join(output, "fixture.js"), "utf8");
		const chunkId = determineChunkIdFromSource(code);
		expect(chunkId).toBeTruthy();
		for (const runtime of ["browser", "server"] as const) {
			const filename =
				runtime === "browser"
					? "https://game.test/assets/fixture.js"
					: "/app/.output/server/fixture.js";
			let thrown: unknown;
			try {
				runInThisContext(code, { filename });
			} catch (error) {
				thrown = error;
			}
			const report = buildErrorReport(thrown, runtime, "garbuix@test");
			const frames = report.exceptions[0].stacktrace.frames;
			const frame = [...frames]
				.reverse()
				.find(
					(item) =>
						item.chunk_id === chunkId &&
						item.lineno !== undefined &&
						item.colno !== undefined,
				);
			expect(frame).toBeDefined();
			if (frame?.lineno === undefined || frame.colno === undefined)
				throw new Error("Missing mapped error position");
			const map = new SourceMap(
				JSON.parse(await readFile(join(output, "fixture.js.map"), "utf8")),
			);
			const original = map.findEntry(frame.lineno - 1, frame.colno - 1);
			if (!("originalSource" in original))
				throw new Error("Missing original source mapping");
			expect(original.originalSource).toMatch(/original\.ts$/);
			expect(original.originalLine).toBe(2);
		}
		await injectPostHogSourceMaps(output);
		expect(await readFile(join(output, "fixture.js"), "utf8")).toBe(code);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
