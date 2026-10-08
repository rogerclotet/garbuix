// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { StrictMode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBeforeAppReload } from "@/lib/app-reload";
import { ServiceWorkerRegister } from "./service-worker";

vi.mock("@/lib/app-version", () => ({
	APP_RELEASE: "release-a",
	APP_SERVICE_WORKER_VERSION: "worker-a",
}));

const reload = vi.fn();
const fetchVersion = vi.fn();
const update = vi.fn(async () => {});
let visibility: DocumentVisibilityState;
let registration: ReturnType<typeof makeRegistration>;
let workers: ReturnType<typeof makeWorkers>;

class Worker extends EventTarget {
	state: ServiceWorkerState = "installed";
	scriptURL = "https://garbuix.app/sw.js?v=worker-b";
	postMessage = vi.fn();
}

class Registration extends EventTarget {
	waiting: Worker | null = null;
	installing: Worker | null = null;
	active: Worker | null = null;
	update = update;
}

function makeRegistration() {
	return new Registration();
}

function serveVersion(
	sentryRelease = "release-a",
	serviceWorkerVersion = "worker-a",
) {
	fetchVersion.mockImplementation(
		async () =>
			new Response(JSON.stringify({ sentryRelease, serviceWorkerVersion })),
	);
}

function SaveCheckpoint({ save }: { save: () => void }) {
	useBeforeAppReload(save);
	return null;
}

function makeWorkers() {
	return Object.assign(new EventTarget(), {
		controller: {},
		getRegistration: vi.fn(async () => registration),
		register: vi.fn(async () => registration),
	});
}

async function settle() {
	await act(async () => {});
}

async function backgroundAndReturn() {
	visibility = "hidden";
	document.dispatchEvent(new Event("visibilitychange"));
	visibility = "visible";
	document.dispatchEvent(new Event("visibilitychange"));
	await settle();
}

beforeEach(() => {
	vi.stubEnv("DEV", false);
	vi.useFakeTimers();
	sessionStorage.clear();
	visibility = "visible";
	vi.spyOn(document, "visibilityState", "get").mockImplementation(
		() => visibility,
	);
	registration = makeRegistration();
	workers = makeWorkers();
	Object.defineProperty(navigator, "serviceWorker", {
		configurable: true,
		value: workers,
	});
	vi.stubGlobal(
		"window",
		Object.assign(Object.create(window), {
			location: { ...window.location, reload },
		}),
	);
	vi.stubGlobal("fetch", fetchVersion);
	serveVersion();
	vi.spyOn(toast, "custom");
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

it("reloads an outdated app release on launch even when its worker is unchanged", async () => {
	serveVersion("release-b");
	render(<ServiceWorkerRegister />);
	await settle();
	expect(reload).toHaveBeenCalledTimes(1);
});

it("checks on background return, without polling or checking ordinary focus", async () => {
	render(<ServiceWorkerRegister />);
	await settle();
	expect(fetchVersion).toHaveBeenCalledTimes(1);
	window.dispatchEvent(new Event("focus"));
	await act(async () => vi.advanceTimersByTime(15 * 60 * 1000));
	expect(fetchVersion).toHaveBeenCalledTimes(1);
	serveVersion("release-b");
	await backgroundAndReturn();
	expect(fetchVersion).toHaveBeenCalledTimes(2);
	expect(reload).toHaveBeenCalledTimes(1);
});

it("does not interrupt play or show a prompt when a slow app-only check finishes", async () => {
	let finish: (value: Response) => void = () => {};
	fetchVersion.mockReturnValue(
		new Promise<Response>((resolve) => {
			finish = resolve;
		}),
	);
	render(<ServiceWorkerRegister />);
	document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
	finish(
		new Response(
			JSON.stringify({
				sentryRelease: "release-b",
				serviceWorkerVersion: "worker-a",
			}),
		),
	);
	await settle();
	expect(reload).not.toHaveBeenCalled();
	expect(toast.custom).not.toHaveBeenCalled();
	serveVersion("release-b");
	await backgroundAndReturn();
	expect(reload).toHaveBeenCalledTimes(1);
});

it("checks a restored page and defers launch checks until a hidden app becomes visible", async () => {
	visibility = "hidden";
	render(<ServiceWorkerRegister />);
	await settle();
	expect(fetchVersion).not.toHaveBeenCalled();
	await backgroundAndReturn();
	expect(fetchVersion).toHaveBeenCalledTimes(1);
	window.dispatchEvent(
		new PageTransitionEvent("pagehide", { persisted: true }),
	);
	window.dispatchEvent(
		new PageTransitionEvent("pageshow", { persisted: true }),
	);
	await settle();
	expect(fetchVersion).toHaveBeenCalledTimes(2);
});

it("does not reload repeatedly when the server keeps returning the old document", async () => {
	serveVersion("release-b");
	render(
		<StrictMode>
			<ServiceWorkerRegister />
		</StrictMode>,
	);
	await settle();
	expect(reload).toHaveBeenCalledTimes(1);
	cleanup();
	render(<ServiceWorkerRegister />);
	await settle();
	await act(async () => vi.advanceTimersByTime(120_000));
	await backgroundAndReturn();
	expect(reload).toHaveBeenCalledTimes(1);
});

it("works without service worker support", async () => {
	Reflect.deleteProperty(navigator, "serviceWorker");
	serveVersion("release-b");
	render(<ServiceWorkerRegister />);
	await settle();
	expect(reload).toHaveBeenCalledTimes(1);
});

it.each([null, {}, { sentryRelease: "release-b", serviceWorkerVersion: 1 }])(
	"ignores an invalid version manifest: %j",
	async (manifest) => {
		fetchVersion.mockImplementation(
			async () => new Response(JSON.stringify(manifest)),
		);
		render(<ServiceWorkerRegister />);
		await settle();
		expect(reload).not.toHaveBeenCalled();
		expect(toast.custom).not.toHaveBeenCalled();
	},
);

it("keeps the app open when offline or when the version request fails", async () => {
	fetchVersion.mockRejectedValue(new TypeError("Failed to fetch"));
	render(<ServiceWorkerRegister />);
	await settle();
	expect(reload).not.toHaveBeenCalled();
	serveVersion("release-b");
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	await backgroundAndReturn();
	expect(reload).not.toHaveBeenCalled();
});

it("saves before reloading and cancels the reload if a checkpoint fails", async () => {
	serveVersion("release-b");
	const save = vi.fn((): void => {
		throw new Error("Storage full");
	});
	render(
		<>
			<SaveCheckpoint save={save} />
			<ServiceWorkerRegister />
		</>,
	);
	await settle();
	expect(save).toHaveBeenCalled();
	expect(reload).not.toHaveBeenCalled();
	save.mockImplementation(() => {
		expect(reload).not.toHaveBeenCalled();
	});
	await backgroundAndReturn();
	expect(reload).toHaveBeenCalledTimes(1);
});

it("waits for worker activation before reloading, saving again at that point", async () => {
	serveVersion("release-b", "worker-b");
	const worker = new Worker();
	registration.waiting = worker;
	const save = vi.fn();
	render(
		<>
			<SaveCheckpoint save={save} />
			<ServiceWorkerRegister />
		</>,
	);
	await settle();
	expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
	expect(save).toHaveBeenCalledTimes(1);
	expect(reload).not.toHaveBeenCalled();
	registration.waiting = null;
	registration.active = worker;
	workers.dispatchEvent(new Event("controllerchange"));
	expect(save).toHaveBeenCalledTimes(2);
	expect(reload).toHaveBeenCalledTimes(1);
});

it("prompts for a worker discovered during play and only reloads after acceptance", async () => {
	render(<ServiceWorkerRegister />);
	await settle();
	const worker = new Worker();
	registration.installing = worker;
	registration.waiting = worker;
	registration.dispatchEvent(new Event("updatefound"));
	expect(toast.custom).toHaveBeenCalledTimes(1);
	expect(fetchVersion).toHaveBeenCalledTimes(1);
	expect(worker.postMessage).not.toHaveBeenCalled();
	expect(reload).not.toHaveBeenCalled();
	const renderToast = vi.mocked(toast.custom).mock.calls[0][0];
	render(renderToast("test-update"));
	fireEvent.click(screen.getByRole("button", { name: "Actualitza" }));
	await settle();
	expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
	workers.dispatchEvent(new Event("controllerchange"));
	expect(reload).toHaveBeenCalledTimes(1);
});

it("does not reload if the player resumes input while a worker is activating", async () => {
	serveVersion("release-b", "worker-b");
	registration.waiting = new Worker();
	render(<ServiceWorkerRegister />);
	await settle();
	document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
	workers.dispatchEvent(new Event("controllerchange"));
	expect(reload).not.toHaveBeenCalled();
});

it("ignores a late version response after unmount", async () => {
	let finish: (value: Response) => void = () => {};
	fetchVersion.mockReturnValue(
		new Promise<Response>((resolve) => {
			finish = resolve;
		}),
	);
	const view = render(<ServiceWorkerRegister />);
	view.unmount();
	finish(
		new Response(
			JSON.stringify({
				sentryRelease: "release-b",
				serviceWorkerVersion: "worker-a",
			}),
		),
	);
	await settle();
	expect(reload).not.toHaveBeenCalled();
	expect(workers.register).not.toHaveBeenCalled();
});

it("waits for a new worker to finish installing before activating it", async () => {
	serveVersion("release-b", "worker-b");
	const worker = new Worker();
	worker.state = "installing";
	registration.installing = worker;
	render(<ServiceWorkerRegister />);
	await settle();
	expect(worker.postMessage).not.toHaveBeenCalled();
	expect(reload).not.toHaveBeenCalled();
	worker.state = "installed";
	registration.installing = null;
	registration.waiting = worker;
	worker.dispatchEvent(new Event("statechange"));
	await settle();
	expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
	expect(reload).not.toHaveBeenCalled();
	workers.dispatchEvent(new Event("controllerchange"));
	expect(reload).toHaveBeenCalledTimes(1);
});

it("does not reload when installing the new worker fails", async () => {
	serveVersion("release-b", "worker-b");
	const worker = new Worker();
	worker.state = "installing";
	registration.installing = worker;
	render(<ServiceWorkerRegister />);
	await settle();
	worker.state = "redundant";
	worker.dispatchEvent(new Event("statechange"));
	await settle();
	expect(reload).not.toHaveBeenCalled();
	expect(toast.custom).toHaveBeenCalledTimes(1);
});

it("skips automatic refresh if the persistent loop guard is unavailable", async () => {
	serveVersion("release-b");
	vi.stubGlobal("sessionStorage", {
		getItem: () => null,
		setItem: () => {
			throw new Error("Storage blocked");
		},
	});
	render(<ServiceWorkerRegister />);
	await settle();
	expect(reload).not.toHaveBeenCalled();
});

it("retries a timed-out version request on the next background return", async () => {
	fetchVersion.mockImplementation(
		(_url: string, options: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				options.signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError")),
				);
			}),
	);
	render(<ServiceWorkerRegister />);
	await act(async () => vi.advanceTimersByTime(10_000));
	expect(reload).not.toHaveBeenCalled();
	serveVersion("release-b");
	await backgroundAndReturn();
	expect(reload).toHaveBeenCalledTimes(1);
});

it("installs the latest worker when only its precache changed, despite a current bundle", async () => {
	const stale = new Worker();
	stale.state = "activated";
	stale.scriptURL = "https://garbuix.app/sw.js?v=worker-old";
	registration.active = stale;
	const latest = new Worker();
	latest.scriptURL = "https://garbuix.app/sw.js?v=worker-a";
	workers.register.mockImplementation(async () => {
		registration.waiting = latest;
		return registration;
	});
	render(<ServiceWorkerRegister />);
	await settle();
	expect(workers.register).toHaveBeenCalledWith("/sw.js?v=worker-a");
	expect(latest.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
	workers.dispatchEvent(new Event("controllerchange"));
	expect(reload).toHaveBeenCalledTimes(1);
});
