import * as Sentry from "@sentry/tanstackstart-react";
import { expect, it, vi } from "vitest";
import { sentryPrivacyOptions } from "../../sentry-privacy";
import { runMonitoredJob } from "./run-monitored-job";

it("delivers job and cleanup failures before returning a failing exit code", async () => {
	const envelopes: unknown[] = [];
	let flushed = false;
	const client = Sentry.init({
		...sentryPrivacyOptions,
		dsn: "https://public@example.com/1",
		defaultIntegrations: false,
		transport: () => ({
			send: async (envelope: unknown) => {
				envelopes.push(envelope);
				return { statusCode: 200 };
			},
			flush: async () => {
				flushed = true;
				return true;
			},
		}),
	});
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		const exitCode = await runMonitoredJob({
			run: async () => {
				Sentry.setUser({ email: "player@example.com" });
				Sentry.setExtra("session", "private-session-token");
				throw new Error("job failure");
			},
			cleanup: async () => {
				throw new Error("cleanup failure");
			},
		});
		expect(exitCode).toBe(1);
		expect(envelopes).toHaveLength(2);
		expect(flushed).toBe(true);
		const serialized = JSON.stringify(envelopes);
		expect(serialized).toContain("job failure");
		expect(serialized).toContain("cleanup failure");
		expect(serialized).not.toContain("player@example.com");
		expect(serialized).not.toContain("private-session-token");
	} finally {
		Sentry.setUser(null);
		Sentry.setExtra("session", undefined);
		log.mockRestore();
		await client?.close();
	}
});

it("cleans up and flushes internally caught errors even when the job succeeds", async () => {
	const envelopes: unknown[] = [];
	const client = Sentry.init({
		dsn: "https://public@example.com/1",
		defaultIntegrations: false,
		transport: () => ({
			send: async (envelope: unknown) => {
				envelopes.push(envelope);
				return { statusCode: 200 };
			},
			flush: async () => true,
		}),
	});
	const cleanup = vi.fn(async () => {});
	try {
		expect(
			await runMonitoredJob({
				run: async () => {
					Sentry.captureException(new Error("one clue failed"));
				},
				cleanup,
			}),
		).toBe(0);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(envelopes).toHaveLength(1);
	} finally {
		await client?.close();
	}
});
