import anonNameWords from "@/data/anon-name-words.json";
import { getDeviceId } from "@/lib/puzzle-local";

const ANON_IDENTITY_KEY = "paraules-anon-identity-v2";
const LEGACY_ANON_IDENTITY_KEY = "paraules-anon-identity-v1";
const ANON_OPT_OUT_KEY = "paraules-leaderboard-opt-out-v1";
const ANON_LB_REPORTED_KEY = "paraules-anon-leaderboard-reported-v1";
const SKIP_SHARE_PREVIEW_KEY = "paraules-skip-share-preview-v1";

export type AnonReportedProgress = {
	wordsFound: number;
	completedAt: string | null;
};

type StoredReportedProgress = {
	dateKey: string;
	wordsFound: number;
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

export function getLeaderboardOptOut(): boolean {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(ANON_OPT_OUT_KEY) === "1";
}

export function setLeaderboardOptOut(optOut: boolean): void {
	if (typeof window === "undefined") return;
	if (optOut) {
		window.localStorage.setItem(ANON_OPT_OUT_KEY, "1");
	} else {
		window.localStorage.removeItem(ANON_OPT_OUT_KEY);
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

export function getReportedAnonProgress(dateKey: string): AnonReportedProgress {
	const empty: AnonReportedProgress = { wordsFound: 0, completedAt: null };
	if (typeof window === "undefined") return empty;
	const raw = window.localStorage.getItem(ANON_LB_REPORTED_KEY);
	if (!raw) return empty;
	try {
		const parsed = JSON.parse(raw) as StoredReportedProgress;
		if (parsed.dateKey !== dateKey) return empty;
		const wordsFound = Number.isFinite(parsed.wordsFound)
			? Math.max(0, Math.trunc(parsed.wordsFound))
			: 0;
		const completedAt =
			typeof parsed.completedAt === "string" ? parsed.completedAt : null;
		return { wordsFound, completedAt };
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
		completedAt: progress.completedAt,
	};
	window.localStorage.setItem(ANON_LB_REPORTED_KEY, JSON.stringify(payload));
}
