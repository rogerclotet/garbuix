import { captureException, flush } from "@sentry/tanstackstart-react";

// The CLI entry point must preload instrument.server.mjs before application imports.
export async function runMonitoredJob({
	run,
	cleanup,
}: {
	run: () => Promise<void>;
	cleanup: () => Promise<void>;
}): Promise<number> {
	let exitCode = 0;
	try {
		await run();
	} catch (error) {
		captureException(error);
		console.error(error);
		exitCode = 1;
	} finally {
		try {
			await cleanup();
		} catch (error) {
			captureException(error);
			console.error(error);
			exitCode = 1;
		}
		// Also drain errors caught inside a successful job, such as a failed clue.
		if (!(await flush(5_000))) {
			console.error(
				"Sentry delivery did not finish before the job's flush timeout",
			);
		}
	}
	return exitCode;
}
