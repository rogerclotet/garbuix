import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

function preGenerate(now: string) {
	const directory = mkdtempSync(join(tmpdir(), "garbuix-pre-generation-"));
	const log = join(directory, "calls");
	const clock = join(directory, "clock.mjs");
	writeFileSync(log, "");
	// Freeze only the clock; execute the real shell and date calculation.
	writeFileSync(
		clock,
		`const OriginalDate = Date;
globalThis.Date = class extends OriginalDate {
  constructor(...args) {
    if (args.length === 0) super(process.env.PREGEN_TEST_NOW);
    else super(...args);
  }
  static now() { return new OriginalDate(process.env.PREGEN_TEST_NOW).getTime(); }
};
`,
	);
	// Do not run paid API requests or database writes from the test.
	writeFileSync(
		join(directory, "pnpm"),
		'#!/bin/sh\necho "$*" >> "$PREGEN_TEST_LOG"\n',
		{ mode: 0o755 },
	);
	try {
		const result = spawnSync("sh", [resolve("scripts/pre-generate.sh")], {
			cwd: resolve("."),
			env: {
				...process.env,
				PATH: `${directory}:${process.env.PATH}`,
				TZ: "UTC",
				NODE_OPTIONS: `--import=${pathToFileURL(clock).href}`,
				PREGEN_TEST_NOW: now,
				PREGEN_TEST_LOG: log,
			},
			encoding: "utf8",
		});
		if (result.error) throw result.error;
		return {
			status: result.status,
			stderr: result.stderr,
			stdout: result.stdout,
			calls: readFileSync(log, "utf8"),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

// The window's boundaries, winter time and the clock changes are covered in
// src/lib/puzzle-dates.test.ts. These two cases check the script's own wiring.
it("skips all generation before the Madrid window", () => {
	// 21:05 Madrid: deployment before the schedule
	const result = preGenerate("2026-10-03T19:05:00Z");
	expect(result.status, result.stderr).toBe(0);
	expect(result.calls).toBe("");
	expect(result.stdout).toContain("skipping");
});

it("generates tomorrow's puzzle and clues in order inside the window", () => {
	// 23:00 Madrid
	const result = preGenerate("2026-10-03T21:00:00Z");
	expect(result.status, result.stderr).toBe(0);
	expect(result.calls).toBe(
		"backfill:puzzles --from 2026-10-04 --to 2026-10-04\nclues:backfill --from 2026-10-04 --to 2026-10-04\n",
	);
});
