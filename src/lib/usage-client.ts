import {
	getUsagePage,
	USAGE_PATH,
	type UsageAction,
	usageEventSchema,
} from "./usage-events";

export function captureUsage(action: UsageAction, pathname?: string) {
	if (typeof window === "undefined") return;
	const parsed = usageEventSchema.safeParse({
		...action,
		page: getUsagePage(pathname ?? window.location.pathname),
	});
	if (!parsed.success) return;
	// No SDK, persistent queue, credentials, referrer, or tracing headers. Failed
	// submissions are dropped rather than replayed with identifiers for deduping.
	void fetch(USAGE_PATH, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(parsed.data),
		credentials: "omit",
		referrerPolicy: "no-referrer",
		cache: "no-store",
		keepalive: true,
	}).catch(() => {});
}

export function clearLegacyPostHogStorage() {
	// Delete by key only. Never read or migrate old identities. Leave game saves,
	// account cookies and preferences alone. Repeat for returning old browsers.
	for (const name of ["localStorage", "sessionStorage"] as const) {
		try {
			const storage = window[name];
			for (const key of Object.keys(storage)) {
				if (isLegacyPostHogKey(key)) storage.removeItem(key);
			}
		} catch {
			/* Storage may be unavailable. */
		}
	}
	const domains = window.location.hostname.split(".");
	for (const cookie of document.cookie.split(";")) {
		const key = cookie.trim().split("=")[0];
		if (!isLegacyPostHogKey(key)) continue;
		const expired = `${key}=; Max-Age=0; Path=/; SameSite=Lax`;
		// biome-ignore lint/suspicious/noDocumentCookie: Delete legacy cookies on browsers without Cookie Store.
		document.cookie = expired;
		for (let i = 0; i < domains.length - 1; i++) {
			// biome-ignore lint/suspicious/noDocumentCookie: Delete the old parent-domain cookie too.
			document.cookie = `${expired}; Domain=${domains.slice(i).join(".")}`;
		}
	}
}

function isLegacyPostHogKey(key: string) {
	return key.startsWith("ph_phc_") || key.startsWith("__ph_opt_in_out_phc_");
}
