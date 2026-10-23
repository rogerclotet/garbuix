import { z } from "zod";
import { getTodayDateKey, getYesterdayDateKey } from "@/lib/puzzle-dates";
import {
	type GuestProgressReport,
	guestProgressReportSchema,
} from "@/lib/usage-stats";

// Guest progress reports wait here until the server has answered, so a puzzle
// finished offline is still counted once the connection is back. The server
// ignores puzzles older than yesterday, so those are dropped instead of sent.

const OUTBOX_KEY = "paraules-guest-progress-outbox-v1";

const outboxSchema = z.array(guestProgressReportSchema);

function isSameSlot(a: GuestProgressReport, b: GuestProgressReport): boolean {
	return a.game === b.game && a.dateKey === b.dateKey;
}

function readOutbox(): GuestProgressReport[] {
	const raw = window.localStorage.getItem(OUTBOX_KEY);
	if (!raw) return [];
	try {
		const parsed = outboxSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : [];
	} catch (error) {
		// A corrupt entry only loses reports; start over rather than retry it.
		if (error instanceof SyntaxError) return [];
		throw error;
	}
}

function writeOutbox(reports: GuestProgressReport[]): void {
	if (reports.length === 0) {
		window.localStorage.removeItem(OUTBOX_KEY);
		return;
	}
	window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(reports));
}

// A finish replaces a start for the same puzzle; a start never undoes a finish.
function enqueue(report: GuestProgressReport): void {
	const outbox = readOutbox();
	const queued = outbox.find((entry) => isSameSlot(entry, report));
	const merged = {
		...report,
		completed: report.completed || Boolean(queued?.completed),
	};
	writeOutbox([
		...outbox.filter((entry) => !isSameSlot(entry, report)),
		merged,
	]);
}

// Keeps the entry if it became a finish while the start was in flight.
function dequeue(delivered: GuestProgressReport): void {
	writeOutbox(
		readOutbox().filter(
			(entry) =>
				!isSameSlot(entry, delivered) ||
				entry.completed !== delivered.completed,
		),
	);
}

// True once the server answered, whatever the status: a rejected report
// won't be accepted on a retry either. False when the request never arrived.
async function deliver(report: GuestProgressReport): Promise<boolean> {
	try {
		await fetch("/api/guest-progress", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(report),
			// The finishing move can be the last thing before the tab closes.
			keepalive: true,
		});
		return true;
	} catch (error) {
		if (error instanceof TypeError) return false;
		throw error;
	}
}

async function drain(): Promise<void> {
	const countable = new Set([getTodayDateKey(), getYesterdayDateKey()]);
	for (;;) {
		const [report] = readOutbox();
		if (!report) return;
		if (countable.has(report.dateKey) && !(await deliver(report))) return;
		dequeue(report);
	}
}

let draining: Promise<void> | null = null;

export function flushGuestProgressReports(): Promise<void> {
	draining ??= drain().finally(() => {
		draining = null;
	});
	return draining;
}

export async function reportGuestProgress(
	report: GuestProgressReport,
): Promise<void> {
	try {
		enqueue(report);
	} catch (error) {
		// Blocked or full storage: nowhere to keep it, so send it once.
		if (!(error instanceof DOMException)) throw error;
		await deliver(report);
		return;
	}
	await flushGuestProgressReports();
}
