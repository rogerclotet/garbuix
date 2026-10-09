type ResourceCloser = () => void | Promise<void>;

export type ShutdownRegistry = {
	trackBackgroundTask: (task: Promise<unknown>) => void;
	registerOpenStream: (close: () => void) => () => void;
	registerResourceCloser: (close: ResourceCloser) => void;
	closeOpenStreams: () => void;
	releaseResources: (deadline: number) => Promise<void>;
};

export function createShutdownRegistry(): ShutdownRegistry {
	const backgroundTasks = new Set<Promise<unknown>>();
	const openStreams = new Set<() => void>();
	const resourceClosers: ResourceCloser[] = [];

	async function waitForBackgroundTasks(deadline: number): Promise<void> {
		if (backgroundTasks.size === 0) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const finished = await Promise.race([
			Promise.allSettled([...backgroundTasks]).then(() => true),
			new Promise<false>((resolve) => {
				timer = setTimeout(
					() => resolve(false),
					Math.max(0, deadline - Date.now()),
				);
			}),
		]);
		clearTimeout(timer);
		if (!finished) {
			console.warn(
				`[shutdown] ${backgroundTasks.size} background task(s) still running at the deadline`,
			);
		}
	}

	return {
		trackBackgroundTask(task) {
			backgroundTasks.add(task);
			// An unhandled failure still surfaces as an unhandled rejection, as it
			// did before the task was tracked.
			void task.finally(() => {
				backgroundTasks.delete(task);
			});
		},
		registerOpenStream(close) {
			openStreams.add(close);
			return () => {
				openStreams.delete(close);
			};
		},
		registerResourceCloser(close) {
			resourceClosers.push(close);
		},
		closeOpenStreams() {
			const streams = [...openStreams];
			openStreams.clear();
			for (const close of streams) close();
		},
		async releaseResources(deadline) {
			// Background work still needs its database and Redis connections.
			await waitForBackgroundTasks(deadline);
			const results = await Promise.allSettled(
				resourceClosers.map(async (close) => close()),
			);
			for (const result of results) {
				if (result.status === "rejected") {
					console.error("[shutdown] Closing a resource failed:", result.reason);
				}
			}
		},
	};
}

// The Nitro plugin and the SSR routes are separate bundles with their own copy
// of this module, so they share one registry through the global object.
const registryKey = Symbol.for("garbuix.shutdown-registry");
const globalRegistry = globalThis as typeof globalThis & {
	[registryKey]?: ShutdownRegistry;
};
globalRegistry[registryKey] ??= createShutdownRegistry();
const registry = globalRegistry[registryKey];

// Responses are sent before this work finishes; shutdown waits for it so a
// deploy does not drop clue generation or leaderboard updates halfway.
export const trackBackgroundTask = registry.trackBackgroundTask;
// Long-lived responses (SSE) never finish on their own and would hold the
// server open until the graceful-close timeout.
export const registerOpenStream = registry.registerOpenStream;
export const registerResourceCloser = registry.registerResourceCloser;
export const closeOpenStreams = registry.closeOpenStreams;
export const releaseResources = registry.releaseResources;
