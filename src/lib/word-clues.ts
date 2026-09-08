export type WordCluesResult =
	| { kind: "ok"; clues: Record<number, string> }
	| { kind: "rate_limited"; retryAfterSeconds: number };
