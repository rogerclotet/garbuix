import { flush } from "@sentry/tanstackstart-react";
import { definePlugin } from "nitro";
import { closeOpenStreams, releaseResources } from "@/lib/shutdown.server";

// Docker sends SIGKILL 10s after SIGTERM. Finish with time to spare so the
// last error reports are delivered instead of cut off.
const SHUTDOWN_BUDGET_MS = 8_000;
const ERROR_FLUSH_TIMEOUT_MS = 1_000;

export default definePlugin((nitroApp) => {
	// Vite's dev server owns its own signals and restarts Nitro without exiting.
	if (process.env.NODE_ENV !== "production") return;

	let deadline: number | undefined;
	// Runs before srvx's SIGTERM handler, which then closes the server and waits
	// for in-flight responses before calling Nitro's close hook.
	process.once("SIGTERM", () => {
		deadline = Date.now() + SHUTDOWN_BUDGET_MS;
		// EventSource clients reconnect to the next container on their own.
		closeOpenStreams();
	});

	nitroApp.hooks.hook("close", async () => {
		if (deadline === undefined) return;
		await releaseResources(deadline - ERROR_FLUSH_TIMEOUT_MS);
		if (!(await flush(ERROR_FLUSH_TIMEOUT_MS))) {
			console.error("[shutdown] Error reports were not delivered before exit");
		}
		// Idle sockets or timers inside dependencies must not keep the process
		// alive until Docker kills it.
		process.exit(0);
	});
});
