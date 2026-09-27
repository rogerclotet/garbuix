import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
	buildErrorReport,
	type ErrorReport,
	type ErrorRuntime,
	sanitizeErrorReport,
} from "./error-report.ts";
import { isUsageTelemetryUrl } from "./telemetry-privacy.ts";

export type ErrorTrackingConfig = {
	host: string;
	key: string;
	environment: string;
	release: string;
};

export function createErrorReporter(config: ErrorTrackingConfig) {
	const captured = new WeakSet<object>();
	const pending = new Set<Promise<void>>();
	const excludedRequest = new AsyncLocalStorage<boolean>();
	let sent = 0;
	let windowStarted = 0;
	async function send(report: ErrorReport, runtime: ErrorRuntime) {
		if (Date.now() - windowStarted > 60_000) {
			windowStarted = Date.now();
			sent = 0;
		}
		if (sent++ >= 100) return;
		const id = randomUUID();
		const safe = sanitizeErrorReport(report, runtime);
		try {
			const response = await fetch(`${config.host.replace(/\/$/, "")}/batch/`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: config.key,
					batch: [
						{
							uuid: id,
							event: "$exception",
							timestamp: new Date().toISOString(),
							properties: {
								distinct_id: `error:${id}`,
								$process_person_profile: false,
								$geoip_disable: true,
								$exception_list: safe.exceptions,
								$exception_level: "error",
								$lib: runtime === "browser" ? "web" : "node",
								$lib_version: "1.55.2",
								$release: safe.release,
								release: safe.release,
								environment: config.environment,
								runtime,
							},
						},
					],
				}),
				redirect: "error",
				signal: AbortSignal.timeout(5000),
			});
			await response.body?.cancel();
		} catch {
			// Never log/retry reporting failures through the same reporter.
		}
	}
	return {
		send,
		capture(error: unknown, handled = true) {
			if (excludedRequest.getStore() || isIncomingRequestAbort(error)) return;
			if (typeof error === "object" && error !== null) {
				if (captured.has(error)) return;
				captured.add(error);
			}
			try {
				const report = buildErrorReport(
					error,
					"server",
					config.release,
					handled,
				);
				const task = send(report, "server");
				pending.add(task);
				void task.finally(() => pending.delete(task));
			} catch {
				/* Diagnostics must not affect the application. */
			}
		},
		async flush() {
			await Promise.allSettled([...pending]);
		},
		withRequest<T>(url: string, action: () => T): T {
			const excluded =
				isUsageTelemetryUrl(url) ||
				new URL(url).pathname.startsWith("/api/monitoring");
			return excludedRequest.run(excluded, action);
		},
	};
}

declare global {
	var __garbuixErrorReporter:
		| ReturnType<typeof createErrorReporter>
		| undefined;
}

export function getErrorReporter() {
	return globalThis.__garbuixErrorReporter;
}

export function isIncomingRequestAbort(error: unknown): boolean {
	const seen = new Set<Error>();
	while (error instanceof Error && !seen.has(error)) {
		seen.add(error);
		if (error.message !== "aborted") return false;
		if (
			"code" in error &&
			error.code === "ECONNRESET" &&
			/\bat abortIncoming \(node:_http_server:\d+:\d+\)/.test(error.stack ?? "")
		)
			return true;
		if (error.name !== "HTTPError") return false;
		error = error.cause;
	}
	return false;
}
