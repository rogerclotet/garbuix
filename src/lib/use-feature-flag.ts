import { useFeatureFlagEnabled } from "@posthog/react";
import { useEffect, useState } from "react";

// Feature flags are evaluated by PostHog, which only loads when POSTHOG_KEY is
// set. Local development usually runs without it, so flags would always read as
// off. In dev we layer two overrides on top of the remote value so flags can be
// exercised locally:
//
//   1. VITE_FEATURE_FLAGS — comma-separated flag keys to force on. Set it in
//      .env (Vite reads it automatically). SSR-safe and deterministic.
//   2. localStorage "ff:<key>" — runtime toggle, no restart needed. Accepts
//      "1"/"true" (on) or "0"/"false" (off) and takes precedence over the env
//      list. Example: localStorage.setItem("ff:ai-word-clues", "1").
//
// Both overrides are compiled out of production builds (import.meta.env.DEV).

const DEV_FLAG_STORAGE_PREFIX = "ff:";

function getEnvFlagOverride(key: string): boolean | undefined {
	const raw = import.meta.env.VITE_FEATURE_FLAGS;
	if (typeof raw !== "string" || raw.length === 0) {
		return undefined;
	}

	const enabled = raw
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);

	return enabled.includes(key) ? true : undefined;
}

function getStorageFlagOverride(key: string): boolean | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}

	// localStorage can be missing (test env) or throw (privacy mode); never let a
	// dev convenience break rendering.
	try {
		const value = window.localStorage?.getItem(
			`${DEV_FLAG_STORAGE_PREFIX}${key}`,
		);
		if (value === "1" || value === "true") return true;
		if (value === "0" || value === "false") return false;
	} catch {
		return undefined;
	}

	return undefined;
}

export function useFeatureFlag(key: string): boolean {
	const remote = Boolean(useFeatureFlagEnabled(key));

	// Initialise from the SSR-safe env override only, so the first client render
	// matches the server markup; localStorage is layered in after mount.
	const [devOverride, setDevOverride] = useState<boolean | undefined>(() =>
		import.meta.env.DEV ? getEnvFlagOverride(key) : undefined,
	);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		setDevOverride(getStorageFlagOverride(key) ?? getEnvFlagOverride(key));
	}, [key]);

	return devOverride ?? remote;
}
