import { captureClientException } from "@/lib/observability-client";

const STATE_KEY_PREFIX = "paraules-state-";
const HISTORY_KEY = "paraules-history-v1";

export type HistoryEntry = {
	seed: number;
	dateKey: string;
	totalWords: number;
	guessedWords: number;
	guesses: number;
	hintsUsed: number;
	completed: boolean;
	lastUpdated: string;
};

export function getCurrentSeed(): number {
	const today = new Date();
	return (
		(today.getFullYear() - 2000) * 10000 +
		(today.getMonth() + 1) * 100 +
		today.getDate()
	);
}

export function getSeedForDate(date: Date): number {
	return (
		(date.getFullYear() - 2000) * 10000 +
		(date.getMonth() + 1) * 100 +
		date.getDate()
	);
}

export function getYesterdaySeed(referenceDate = new Date()): number {
	const yesterday = new Date(referenceDate);
	yesterday.setDate(yesterday.getDate() - 1);
	return getSeedForDate(yesterday);
}

export function getStateKey(seed: number) {
	return `${STATE_KEY_PREFIX}${seed}`;
}

export function seedToDate(seed: number): Date {
	const year = 2000 + Math.floor(seed / 10000);
	const month = Math.floor(seed / 100) % 100;
	const day = seed % 100;
	return new Date(year, month - 1, day);
}

export function seedToISODate(seed: number): string {
	const date = seedToDate(seed);
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function readHistoryMap(): Record<number, HistoryEntry> {
	if (typeof window === "undefined") return {};

	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<number, HistoryEntry>;
		if (!parsed || typeof parsed !== "object") return {};
		return parsed;
	} catch (error) {
		console.error("Failed to read history:", error);
		void captureClientException(error, {
			scope: "read_history_map",
			storage_key: HISTORY_KEY,
		});
		return {};
	}
}

function writeHistoryMap(history: Record<number, HistoryEntry>) {
	if (typeof window === "undefined") return;
	localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function saveHistorySnapshot(snapshot: {
	seed: number;
	totalWords: number;
	guessedWords: number;
	guesses: number;
	hintsUsed: number;
}) {
	if (typeof window === "undefined") return;

	const history = readHistoryMap();
	const completed =
		snapshot.totalWords > 0 && snapshot.guessedWords >= snapshot.totalWords;

	history[snapshot.seed] = {
		seed: snapshot.seed,
		dateKey: seedToISODate(snapshot.seed),
		totalWords: snapshot.totalWords,
		guessedWords: snapshot.guessedWords,
		guesses: snapshot.guesses,
		hintsUsed: snapshot.hintsUsed,
		completed,
		lastUpdated: new Date().toISOString(),
	};

	writeHistoryMap(history);
}

export function getHistoryEntries(): HistoryEntry[] {
	const history = readHistoryMap();
	return Object.values(history).sort((a, b) => b.seed - a.seed);
}

export function getHistoryEntry(seed: number): HistoryEntry | null {
	const history = readHistoryMap();
	return history[seed] ?? null;
}
