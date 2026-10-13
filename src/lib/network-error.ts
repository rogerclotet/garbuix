// True when a request most likely never got an answer from the server: the
// device is offline, the request was aborted, or fetch itself failed. Browsers
// word a failed fetch differently ("Failed to fetch", "Load failed",
// "NetworkError when attempting to fetch resource"), and a lazy route chunk
// that cannot be downloaded reports "Failed to fetch dynamically imported
// module".
export function isLikelyNetworkError(error: unknown) {
	if (typeof navigator !== "undefined" && !navigator.onLine) {
		return true;
	}

	if (error instanceof DOMException && error.name === "AbortError") {
		return true;
	}

	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";

	const normalizedMessage = message.toLowerCase();

	return (
		normalizedMessage.includes("failed to fetch") ||
		normalizedMessage.includes("networkerror") ||
		normalizedMessage.includes("network error") ||
		normalizedMessage.includes("load failed")
	);
}
