import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
	EXCEPTION_MARKER,
	findIncompatibleStatements,
} from "./lib/migration-compatibility.ts";

// Runs on plain Node without installed dependencies, so CI can check a PR
// before anything else is set up.

const MIGRATIONS_DIRECTORY = "drizzle";
// Must cover the schema files in drizzle.config.ts.
const SCHEMA_DIRECTORY = "src/db";

function changedFiles(range: string, filter: string, path: string): string[] {
	return execFileSync(
		"git",
		["diff", "--name-only", `--diff-filter=${filter}`, range, "--", path],
		{ encoding: "utf8" },
	)
		.split("\n")
		.filter((file) => file !== "");
}

// The commit of the release this one replaces. Three dots compare from the
// merge base, so commits only the base branch has do not count as changes.
const base = process.argv[2] ?? "origin/main";
const range = `${base}...HEAD`;

const migrations = changedFiles(range, "A", MIGRATIONS_DIRECTORY)
	.filter((file) => file.endsWith(".sql"))
	.map((file) => ({ file, sql: readFileSync(file, "utf8") }));
const schemaChanged = changedFiles(range, "ACDMR", SCHEMA_DIRECTORY).length > 0;
const findings = findIncompatibleStatements(migrations, { schemaChanged });

console.log(
	`Checked ${migrations.length} new migration(s) against ${base}; the Drizzle schema ${schemaChanged ? "changed" : "did not change"}.`,
);
for (const { file, line, statement, reason } of findings) {
	if (process.env.GITHUB_ACTIONS) {
		console.log(`::error file=${file},line=${line}::${reason}`);
	}
	console.error(`\n${file}:${line}\n  ${statement}\n  ${reason}.`);
}
if (findings.length > 0) {
	console.error(
		`\nSee "Database migrations" in AGENTS.md. If the previous release does tolerate a statement, put "${EXCEPTION_MARKER} <why>" on a line above it.`,
	);
	process.exit(1);
}
