import {
	USAGE_STATS_OFF_COOKIE,
	USAGE_STATS_OFF_MAX_AGE_SECONDS,
} from "@/lib/usage-stats";

type NavigatorWithPrivacySignals = Navigator & {
	// Not yet in TypeScript's DOM types.
	globalPrivacyControl?: boolean;
};

// Global Privacy Control or Do Not Track. The server honours both headers on
// its own; the browser checks them to skip the request and to explain why the
// switch in Preferències is locked.
export function browserAsksNotToTrack(): boolean {
	if (typeof navigator === "undefined") return false;
	const signals = navigator as NavigatorWithPrivacySignals;
	return signals.globalPrivacyControl === true || signals.doNotTrack === "1";
}

export function hasUsageStatsOptOut(): boolean {
	if (typeof document === "undefined") return false;
	return document.cookie
		.split(";")
		.some((pair) => pair.trim() === `${USAGE_STATS_OFF_COOKIE}=1`);
}

export function setUsageStatsOptOut(optedOut: boolean): void {
	if (typeof document === "undefined") return;
	// Dev serves plain HTTP on localhost, where a Secure cookie is dropped.
	const secure = window.location.protocol === "https:" ? "; Secure" : "";
	const value = optedOut
		? `1; Max-Age=${USAGE_STATS_OFF_MAX_AGE_SECONDS}`
		: "; Max-Age=0";
	// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is async, and the switch and the report read this synchronously.
	document.cookie = `${USAGE_STATS_OFF_COOKIE}=${value}; Path=/; SameSite=Lax${secure}`;
}

export function canReportUsage(): boolean {
	return !browserAsksNotToTrack() && !hasUsageStatsOptOut();
}
