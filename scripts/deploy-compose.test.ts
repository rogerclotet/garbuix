import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

type Color = "blue" | "green";

type Deployment = {
	args?: string[];
	failure?: "pull" | "migration" | "readiness";
	images?: Record<string, string>;
	// The color serving the previous release. A server's first deploy has none.
	serving?: Color;
};

function deploy({ args = [], failure, images = {}, serving }: Deployment = {}) {
	const directory = mkdtempSync(join(tmpdir(), "garbuix-deploy-"));
	const log = join(directory, "calls");
	writeFileSync(log, "");
	if (serving) {
		writeFileSync(join(directory, "upstream"), `to app-${serving}:3000\n`);
		writeFileSync(join(directory, `running.${serving}`), "");
	}
	// CI uses a source archive in a slim image without Git. Release discovery
	// is independent of the deployment ordering under test.
	writeFileSync(
		join(directory, "git"),
		`#!/bin/sh
test "$*" = "rev-parse --short=8 HEAD" || exit 1
echo 1234abcd
`,
		{ mode: 0o755 },
	);
	// Run the actual deployment shell. Docker is the external boundary; reject
	// dependency replacement with live writers, as happened in production, and
	// replacing the color that is serving.
	writeFileSync(
		join(directory, "docker"),
		`#!/bin/sh
echo "$*" >> "$DEPLOY_TEST_LOG"
state="$DEPLOY_TEST_STATE"
# Trimming $* directly would trim each argument instead of the whole call.
call="$*"
color="\${call##*app-}"
writers_stopped() {
  test -f "$state/stopped.scheduler" && ! ls "$state"/running.* >/dev/null 2>&1
}
case "$*" in
  "pull "*) test "$DEPLOY_TEST_FAILURE" != pull || exit 45 ;;
  "compose stop pre-generator") touch "$state/stopped.scheduler" ;;
  "compose stop app-blue app-green") rm -f "$state"/running.* ;;
  "compose stop app-"*) rm -f "$state/running.$color" ;;
  *" db redis proxy")
    case "$*" in
      *--no-recreate*) ;;
      *) writers_stopped || exit 42 ;;
    esac ;;
  "compose exec -T proxy sh -c cat "*) cat "$state/upstream" 2>/dev/null || true ;;
  *"echo 'to app-blue:3000'"*) echo "to app-blue:3000" > "$state/upstream" ;;
  *"echo 'to app-green:3000'"*) echo "to app-green:3000" > "$state/upstream" ;;
  "compose ps -q --status running app-"*)
    test ! -f "$state/running.$color" || echo container ;;
  *db:migrate*) test "$DEPLOY_TEST_FAILURE" != migration || exit 43 ;;
  *--force-recreate*" app-"*)
    test ! -f "$state/running.$color" || exit 46
    test "$DEPLOY_TEST_FAILURE" != readiness || exit 44
    touch "$state/running.$color" ;;
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
					DEPLOY_TEST_STATE: directory,
					DEPLOY_TEST_FAILURE: failure ?? "",
					DEPLOY_APP_IMAGE: "",
					DEPLOY_SCHEDULER_IMAGE: "",
					...images,
				},
				encoding: "utf8",
			},
		);
		if (result.error) throw result.error;
		const calls = readFileSync(log, "utf8");
		const lines = calls.trim().split("\n");
		return {
			status: result.status,
			stderr: result.stderr,
			calls,
			// The position of the first call containing the text, or -1.
			step: (text: string) => lines.findIndex((line) => line.includes(text)),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const routeTo = (color: Color) => `echo 'to app-${color}:3000'`;
const start = (color: Color) =>
	`--force-recreate --wait --wait-timeout 120 app-${color}`;

it.each([
	{ serving: "blue", next: "green" },
	{ serving: "green", next: "blue" },
] as const)(
	"migrates and starts $next while $serving serves, then switches the proxy",
	({ serving, next }) => {
		const result = deploy({ serving });
		expect(result.status, result.stderr).toBe(0);
		const migrated = result.step("db:migrate");
		const ready = result.step(start(next));
		const switched = result.step(routeTo(next));
		const stopped = result.step("compose stop");
		expect(migrated).toBeGreaterThan(-1);
		expect(ready).toBeGreaterThan(migrated);
		expect(switched).toBeGreaterThan(ready);
		expect(stopped).toBeGreaterThan(switched);
		expect(result.calls).toContain(`compose stop app-${serving}\n`);
		expect(result.calls).not.toContain("compose stop pre-generator");
	},
);

it("holds requests at the proxy for a server's first release", () => {
	const result = deploy();
	expect(result.status, result.stderr).toBe(0);
	const held = result.step(routeTo("blue"));
	expect(held).toBeGreaterThan(-1);
	expect(result.step(start("blue"))).toBeGreaterThan(held);
});

it("stops writers before explicitly updating dependencies", () => {
	const result = deploy({ args: ["--update-dependencies"], serving: "blue" });
	expect(result.status, result.stderr).toBe(0);
	expect(result.calls).toContain("--pull always");
	expect(result.step("compose stop pre-generator")).toBeLessThan(
		result.step("compose stop app-blue app-green"),
	);
});

it("recreates the scheduler only after the app is ready", () => {
	const result = deploy({ serving: "blue" });
	expect(result.status, result.stderr).toBe(0);
	const startups = result.calls
		.split("\n")
		.filter((line) => line.includes("--force-recreate"));
	expect(startups).toHaveLength(2);
	expect(startups[0]).toMatch(/ app-green$/);
	expect(startups[1]).toMatch(/ pre-generator$/);
	for (const startup of startups) {
		expect(startup).toContain("--no-deps");
		expect(startup).toContain("--wait --wait-timeout");
	}
});

it("keeps the old release serving when the new one never becomes ready", () => {
	const result = deploy({ serving: "blue", failure: "readiness" });
	expect(result.status, result.stderr).toBe(44);
	expect(result.calls).not.toContain(routeTo("green"));
	expect(result.calls).not.toContain("compose stop");
	expect(result.calls).not.toMatch(/--force-recreate.* pre-generator$/m);
});

it("keeps the old release serving if migrations fail", () => {
	const result = deploy({ serving: "blue", failure: "migration" });
	expect(result.status, result.stderr).toBe(43);
	expect(result.calls).not.toContain("--force-recreate");
	expect(result.calls).not.toContain(routeTo("green"));
	expect(result.calls).not.toContain("compose stop");
});

const published = {
	DEPLOY_APP_IMAGE: "ghcr.io/owner/garbuix/app:abc",
	DEPLOY_SCHEDULER_IMAGE: "ghcr.io/owner/garbuix/scheduler:abc",
};

it("deploys published images under the names Compose uses, without building", () => {
	const result = deploy({ images: published });
	expect(result.status, result.stderr).toBe(0);
	const calls = result.calls.trim().split("\n");
	expect(calls.slice(0, 5)).toEqual([
		"pull ghcr.io/owner/garbuix/app:abc",
		"pull ghcr.io/owner/garbuix/scheduler:abc",
		"tag ghcr.io/owner/garbuix/app:abc paraules-app:prod",
		"tag ghcr.io/owner/garbuix/scheduler:abc paraules-scheduler:prod",
		"image rm ghcr.io/owner/garbuix/app:abc ghcr.io/owner/garbuix/scheduler:abc",
	]);
	expect(result.calls).not.toContain("compose build");
	expect(result.calls).toContain("db:migrate");
});

it("keeps the running release untouched when pulling fails", () => {
	const result = deploy({ failure: "pull", images: published });
	expect(result.status, result.stderr).toBe(45);
	expect(result.calls).not.toContain("compose stop");
});

it("refuses to deploy only one published image", () => {
	const result = deploy({
		images: { DEPLOY_APP_IMAGE: published.DEPLOY_APP_IMAGE },
	});
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain("must be set together");
	expect(result.calls).toBe("");
});

it("builds on the server when no published images are given", () => {
	const result = deploy();
	expect(result.status, result.stderr).toBe(0);
	expect(result.calls.split("\n")[0]).toBe(
		"compose build app-blue pre-generator",
	);
	expect(result.calls).not.toContain("pull ");
});
