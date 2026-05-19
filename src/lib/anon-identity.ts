import anonNameWords from "@/data/anon-name-words.json";
import { getDeviceId } from "@/lib/puzzle-local";

const ANON_IDENTITY_KEY = "paraules-anon-identity-v1";
const ANON_OPT_OUT_KEY = "paraules-leaderboard-opt-out-v1";

export type AnonIdentity = {
	deviceId: string;
	name: string;
};

type StoredIdentity = {
	deviceId: string;
	name: string;
	version: 1;
};

function pickName(): string {
	const adjectives = anonNameWords.adjectives;
	const animals = anonNameWords.animals;
	const adjectiveIndex = Math.floor(Math.random() * adjectives.length);
	const animalIndex = Math.floor(Math.random() * animals.length);
	return `${adjectives[adjectiveIndex]} ${animals[animalIndex]}`;
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
	const identity: StoredIdentity = {
		version: 1,
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
