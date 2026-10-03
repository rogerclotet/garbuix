import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

function deploy(args: string[] = [], failure = "") {
	const directory = mkdtempSync(join(tmpdir(), "garbuix-deploy-"));
	const log = join(directory, "calls");
	// Run the actual deployment shell. Docker is the external boundary; reject
	// dependency replacement with live writers, as happened in production.
	writeFileSync(
		join(directory, "docker"),
		`#!/bin/sh
echo "$*" >> "$DEPLOY_TEST_LOG"
case "$*" in
  "compose stop app pre-generator") touch "$DEPLOY_TEST_STOPPED" ;;
  *" db redis")
    case "$*" in
      *--no-recreate*) ;;
      *) test -f "$DEPLOY_TEST_STOPPED" || exit 42 ;;
    esac ;;
esac
case "$*" in
  *db:migrate*) test "$DEPLOY_TEST_FAILURE" != migration || exit 43 ;;
  *--force-recreate*) test "$DEPLOY_TEST_FAILURE" != readiness || exit 44 ;;
esac
`,
		{ mode: 0o755 },
	);
	try {
		const result = spawnSync(
			"sh",
			[resolve("scripts/deploy-compose.sh"), ...args],
			{
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					DEPLOY_TEST_LOG: log,
					DEPLOY_TEST_STOPPED: join(directory, "stopped"),
					DEPLOY_TEST_FAILURE: failure,
				},
				encoding: "utf8",
			},
		);
		return { status: result.status, calls: readFileSync(log, "utf8") };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

it("keeps dependencies running during routine deployments and waits for app readiness", () => {
	const result = deploy();
	expect(result.status).toBe(0);
	const startup = result.calls
		.split("\n")
		.find((line) => line.includes("--force-recreate"));
	expect(startup).toContain("--no-deps");
	expect(startup).toContain("--wait --wait-timeout");
});

it("stops writers before explicitly updating dependencies", () => {
	const result = deploy(["--update-dependencies"]);
	expect(result.status).toBe(0);
	expect(result.calls).toContain("--pull always");
});

it("leaves writers stopped if migrations fail", () => {
	const result = deploy([], "migration");
	expect(result.status).toBe(43);
	expect(result.calls).not.toContain("--force-recreate");
});

it("fails the deployment when the app never becomes ready", () => {
	expect(deploy([], "readiness").status).toBe(44);
});
