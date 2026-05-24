import type {
	AccountPuzzleCache,
	AnonymousImportPayload,
	HistorySummaryEntry,
	PuzzleProgressState,
} from "@/lib/puzzle-types";

const ANON_PROGRESS_PREFIX = "paraules-anon-progress-v2:";
const ANON_HISTORY_KEY = "paraules-anon-history-v2";
const ACCOUNT_CACHE_PREFIX = "paraules-account-cache-v1:";
const IMPORT_MARKER_PREFIX = "paraules-account-import-v1:";
const DEVICE_ID_KEY = "paraules-device-id-v1";
const HOW_TO_PLAY_SEEN_KEY = "paraules-how-to-play-seen-v1";
const WELCOME_SEEN_KEY = "paraules-welcome-seen-v1";

function readJson<T>(key: string): T | null {
	if (typeof window === "undefined") return null;

	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeJson(key: string, value: unknown) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(key, JSON.stringify(value));
}

export function getAnonymousProgress(dateKey: string) {
	return readJson<PuzzleProgressState>(`${ANON_PROGRESS_PREFIX}${dateKey}`);
}

export function saveAnonymousProgress(
	dateKey: string,
	progress: PuzzleProgressState,
) {
	writeJson(`${ANON_PROGRESS_PREFIX}${dateKey}`, progress);
}

export function clearAnonymousProgress(dateKey: string) {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(`${ANON_PROGRESS_PREFIX}${dateKey}`);
}

export function getAnonymousHistoryEntries() {
	return readJson<Record<string, HistorySummaryEntry>>(ANON_HISTORY_KEY) ?? {};
}

export function saveAnonymousHistoryEntry(entry: HistorySummaryEntry) {
	const history = getAnonymousHistoryEntries();
	history[entry.dateKey] = entry;
	writeJson(ANON_HISTORY_KEY, history);
}

export function getSortedAnonymousHistoryEntries() {
	return Object.values(getAnonymousHistoryEntries()).sort((left, right) =>
		right.dateKey.localeCompare(left.dateKey),
	);
}

export function getAccountPuzzleCache(userId: string, dateKey: string) {
	return readJson<AccountPuzzleCache>(
		`${ACCOUNT_CACHE_PREFIX}${userId}:${dateKey}`,
	);
}

export function saveAccountPuzzleCache(
	userId: string,
	dateKey: string,
	cache: AccountPuzzleCache,
) {
	writeJson(`${ACCOUNT_CACHE_PREFIX}${userId}:${dateKey}`, cache);
}

export function clearAccountPuzzleCache(userId: string, dateKey: string) {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(`${ACCOUNT_CACHE_PREFIX}${userId}:${dateKey}`);
}

export function getStaleAccountCachesWithEvents(
	userId: string,
	currentDateKey: string,
) {
	if (typeof window === "undefined") return [];
	const prefix = `${ACCOUNT_CACHE_PREFIX}${userId}:`;
	const results: Array<{ dateKey: string; cache: AccountPuzzleCache }> = [];
	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);
		if (!key?.startsWith(prefix)) continue;
		const dateKey = key.slice(prefix.length);
		if (dateKey === currentDateKey) continue;
		const cache = readJson<AccountPuzzleCache>(key);
		if (!cache?.queuedEvents?.length) continue;
		results.push({ dateKey, cache });
	}
	return results;
}

export function hasImportedAnonymousData(userId: string) {
	if (typeof window === "undefined") return false;
	return (
		window.localStorage.getItem(`${IMPORT_MARKER_PREFIX}${userId}`) === "1"
	);
}

export function markAnonymousDataImported(userId: string) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(`${IMPORT_MARKER_PREFIX}${userId}`, "1");
}

export function buildAnonymousImportPayload(): AnonymousImportPayload {
	if (typeof window === "undefined") {
		return {
			historyEntries: [],
			activeProgressByDate: {},
		};
	}

	const activeProgressByDate: Record<string, PuzzleProgressState> = {};
	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);
		if (!key?.startsWith(ANON_PROGRESS_PREFIX)) continue;
		const dateKey = key.slice(ANON_PROGRESS_PREFIX.length);
		const progress = readJson<PuzzleProgressState>(key);
		if (!progress) continue;
		activeProgressByDate[dateKey] = progress;
	}

	return {
		historyEntries: getSortedAnonymousHistoryEntries(),
		activeProgressByDate,
	};
}

export function hasSeenHowToPlay(): boolean {
	if (typeof window === "undefined") return true;
	return window.localStorage.getItem(HOW_TO_PLAY_SEEN_KEY) === "1";
}

export function markHowToPlaySeen() {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(HOW_TO_PLAY_SEEN_KEY, "1");
}

export function hasSeenWelcome(): boolean {
	if (typeof window === "undefined") return true;
	return window.localStorage.getItem(WELCOME_SEEN_KEY) === "1";
}

export function markWelcomeSeen() {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
}

export function getDeviceId() {
	if (typeof window === "undefined") {
		return "server-device";
	}

	let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
	if (!deviceId) {
		deviceId = crypto.randomUUID();
		window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
	}

	return deviceId;
}
