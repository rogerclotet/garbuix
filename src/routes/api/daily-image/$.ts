import { createFileRoute } from "@tanstack/react-router";
import { getDailyPuzzleCardPng } from "@/lib/puzzle-card.server";
import { isPlayableDateKey } from "@/lib/puzzle-dates";

// The puzzle never changes, but the card's design and numbering can ship in a
// deploy, so caches only keep it for a day.
const CACHE_CONTROL = "public, max-age=86400";

export const Route = createFileRoute("/api/daily-image/$")({
	server: {
		handlers: {
			GET: ({ params }) => handleGet(params._splat ?? ""),
		},
	},
});

// The image shows only what a player sees before their first guess, so it is
// public, but never for a future day.
async function handleGet(path: string): Promise<Response> {
	const dateKey = path.match(/^(\d{4}-\d{2}-\d{2})\.png$/)?.[1];
	if (!dateKey || !isPlayableDateKey(dateKey)) {
		return new Response("Not found", { status: 404 });
	}

	const png = await getDailyPuzzleCardPng(dateKey);
	if (!png) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(new Uint8Array(png), {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": CACHE_CONTROL,
		},
	});
}
