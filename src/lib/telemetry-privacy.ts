export function isUsageTelemetryUrl(value: unknown): boolean {
	if (typeof value !== "string") return false;
	try {
		const path = new URL(
			value.replace(/^(GET|HEAD|POST|OPTIONS|PUT|PATCH|DELETE)\s+/, ""),
			"https://local.invalid",
		).pathname.replace(/\/$/, "");
		return path === "/api/usage" || path === "/ph" || path.startsWith("/ph/");
	} catch {
		return false;
	}
}
