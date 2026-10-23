export function readCookie(headers: Headers, name: string): string | null {
	const header = headers.get("cookie");
	if (!header) {
		return null;
	}

	for (const pair of header.split(";")) {
		const separatorIndex = pair.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}
		if (pair.slice(0, separatorIndex).trim() === name) {
			return pair.slice(separatorIndex + 1).trim();
		}
	}

	return null;
}
