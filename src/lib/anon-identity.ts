import anonNameWords from "@/data/anon-name-words.json";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import { getDeviceId } from "@/lib/puzzle-local";
import { normalizeDisplayNameInput } from "@/lib/user-profile";

const ANON_IDENTITY_KEY = "paraules-anon-identity-v2";
const LEGACY_ANON_IDENTITY_KEY = "paraules-anon-identity-v1";
const ANON_LB_REPORTED_KEY = "paraules-anon-leaderboard-reported-v1";
const SKIP_SHARE_PREVIEW_KEY = "paraules-skip-share-preview-v1";
const VIBRATION_KEY = "paraules-vibration-v1";
const LETTER_LAYOUT_KEY = "paraules-letter-layout-v1";
const BONUS_CLUES_KEY = "paraules-bonus-clues-v1";

// What was last reported to the leaderboard for this device, so a reload
// doesn't replay it. Carries every field the score is built from, not just the
// words: tries and clues break ties, so they have to be reported as they move.
export type AnonReportedProgress = {
	wordsFound: number;
	tryCount: number;
	clueCount: number;
	completedAt: string | null;
};

type StoredReportedProgress = {
	dateKey: string;
	wordsFound: number;
	// Absent in payloads written before tries and clues were reported.
	tryCount?: number;
	clueCount?: number;
	completedAt: string | null;
};

export type AnonIdentity = {
	deviceId: string;
	name: string;
};

type StoredIdentity = {
	deviceId: string;
	name: string;
	version: 2;
};

function pickName(): string {
	const { adjectives, animals } = anonNameWords;
	const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
	const animal = animals[Math.floor(Math.random() * animals.length)];
	if (!adjective || !animal) {
		return "Convidat";
	}
	const inflected = animal.gender === "f" ? adjective.fem : adjective.masc;
	return `${animal.name} ${inflected.toLowerCase()}`;
}

export function getOrCreateAnonIdentity(): AnonIdentity {
	const deviceId = getDeviceId();
	if (typeof window === "undefined") {
		return { deviceId, name: "Convidat" };
	}
	const raw = window.localStorage.getItem(ANON_IDENTITY_KEY);
	if (raw) {
		try {
			const parsed = JSON.parse(raw) as StoredIdentity;
			if (parsed.deviceId === deviceId && parsed.name) {
				return { deviceId, name: parsed.name };
			}
		} catch {
			// fall through to regeneration
		}
	}
	// Drop any legacy (adjective+animal, ungendered) identity so the
	// holder regenerates with a grammatically-correct name.
	window.localStorage.removeItem(LEGACY_ANON_IDENTITY_KEY);

	const identity: StoredIdentity = {
		version: 2,
		deviceId,
		name: pickName(),
	};
	window.localStorage.setItem(ANON_IDENTITY_KEY, JSON.stringify(identity));
	return { deviceId: identity.deviceId, name: identity.name };
}

export function setAnonDisplayName(name: string): boolean {
	const normalized = normalizeDisplayNameInput(name);
	if (!normalized) {
		return false;
	}
	if (typeof window === "undefined") {
		return false;
	}
	const identity = getOrCreateAnonIdentity();
	const payload: StoredIdentity = {
		version: 2,
		deviceId: identity.deviceId,
		name: normalized,
	};
	window.localStorage.setItem(ANON_IDENTITY_KEY, JSON.stringify(payload));
	return true;
}

export async function refreshAnonLeaderboardName(name: string): Promise<void> {
	if (typeof window === "undefined") {
		return;
	}
	const dateKey = getTodayDateKey();
	const reported = getReportedAnonProgress(dateKey);
	// A player who has only made wrong guesses is on the board too, so their
	// tries are reason enough to push the new name.
	if (
		reported.wordsFound === 0 &&
		reported.tryCount === 0 &&
		!reported.completedAt
	) {
		return;
	}
	try {
		await fetch(`/api/leaderboard/${dateKey}/anon/profile`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});
	} catch {
		// non-fatal: leaderboard profile refresh can quietly fail
	}
}

export function getSkipSharePreview(): boolean {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(SKIP_SHARE_PREVIEW_KEY) === "1";
}

export function setSkipSharePreview(skip: boolean): void {
	if (typeof window === "undefined") return;
	if (skip) {
		window.localStorage.setItem(SKIP_SHARE_PREVIEW_KEY, "1");
	} else {
		window.localStorage.removeItem(SKIP_SHARE_PREVIEW_KEY);
	}
}

// Vibration uses a tri-state preference so we can honor the device's
// reduced-motion setting when the user hasn't made an explicit choice:
//   null  -> follow the device (reduced-motion implies no vibration)
//   true  -> user explicitly enabled vibration
//   false -> user explicitly disabled vibration
export function getVibrationPreference(): boolean | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(VIBRATION_KEY);
		if (raw === "1") return true;
		if (raw === "0") return false;
	} catch {
		// Storage can be unavailable (private mode, disabled cookies); fall
		// back to following the device preference.
	}
	return null;
}

export function setVibrationPreference(enabled: boolean): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(VIBRATION_KEY, enabled ? "1" : "0");
	} catch {
		// Best-effort persistence; ignore storage failures.
	}
}

function deviceWantsReducedMotion(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Resolves the tri-state preference against the device's reduced-motion
// setting to a concrete on/off used both by the haptics call site and the
// preferences toggle's default value.
export function isVibrationEnabled(): boolean {
	const preference = getVibrationPreference();
	if (preference !== null) return preference;
	return !deviceWantsReducedMotion();
}

export type LetterLayout = "circle" | "grid" | "line";

const VALID_LETTER_LAYOUTS: readonly LetterLayout[] = [
	"circle",
	"grid",
	"line",
];

// The board starts on the circle; a player can pick the grid or the line in
// /preferencies.
export const DEFAULT_LETTER_LAYOUT: LetterLayout = "circle";

export function getLetterLayout(): LetterLayout {
	if (typeof window === "undefined") return DEFAULT_LETTER_LAYOUT;
	try {
		const stored = window.localStorage.getItem(LETTER_LAYOUT_KEY);
		if (stored && (VALID_LETTER_LAYOUTS as string[]).includes(stored)) {
			return stored as LetterLayout;
		}
	} catch {
		// Storage may be unavailable (private mode); fall back to the default.
	}
	return DEFAULT_LETTER_LAYOUT;
}

export function setLetterLayout(layout: LetterLayout): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(LETTER_LAYOUT_KEY, layout);
	} catch {
		// Best-effort persistence; ignore storage failures.
	}
}

// Bonus clues are enabled by default; turning them off is the "hardcore" mode.
// Absence of the key means enabled, so only the disabled state is persisted.
export function getBonusCluesEnabled(): boolean {
	if (typeof window === "undefined") return true;
	try {
		return window.localStorage.getItem(BONUS_CLUES_KEY) !== "0";
	} catch {
		// Storage can be unavailable (private mode, disabled cookies); default on.
		return true;
	}
}

export function setBonusCluesEnabled(enabled: boolean): void {
	if (typeof window === "undefined") return;
	try {
		if (enabled) {
			window.localStorage.removeItem(BONUS_CLUES_KEY);
		} else {
			window.localStorage.setItem(BONUS_CLUES_KEY, "0");
		}
	} catch {
		// Best-effort persistence; ignore storage failures.
	}
}

function readCount(value: number | undefined): number {
	return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : 0;
}

export function getReportedAnonProgress(dateKey: string): AnonReportedProgress {
	const empty: AnonReportedProgress = {
		wordsFound: 0,
		tryCount: 0,
		clueCount: 0,
		completedAt: null,
	};
	if (typeof window === "undefined") return empty;
	const raw = window.localStorage.getItem(ANON_LB_REPORTED_KEY);
	if (!raw) return empty;
	try {
		const parsed = JSON.parse(raw) as StoredReportedProgress;
		if (parsed.dateKey !== dateKey) return empty;
		const completedAt =
			typeof parsed.completedAt === "string" ? parsed.completedAt : null;
		return {
			wordsFound: readCount(parsed.wordsFound),
			tryCount: readCount(parsed.tryCount),
			clueCount: readCount(parsed.clueCount),
			completedAt,
		};
	} catch {
		return empty;
	}
}

export function setReportedAnonProgress(
	dateKey: string,
	progress: AnonReportedProgress,
): void {
	if (typeof window === "undefined") return;
	const payload: StoredReportedProgress = {
		dateKey,
		wordsFound: progress.wordsFound,
		tryCount: progress.tryCount,
		clueCount: progress.clueCount,
		completedAt: progress.completedAt,
	};
	window.localStorage.setItem(ANON_LB_REPORTED_KEY, JSON.stringify(payload));
}
