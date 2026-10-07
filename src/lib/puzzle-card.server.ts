import { createRequire } from "node:module";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
	drawPuzzleCard,
	measurePuzzleCard,
	type PuzzleCardInput,
} from "@/lib/puzzle-card";
import { readDailyPuzzleRow } from "@/lib/puzzle-generation.server";
import { formatShortPuzzleDate, getPuzzleNumber } from "@/lib/puzzle-number";

// Reddit shows images scaled down, so render at twice the CSS size to stay
// sharp on high-density screens.
const RENDER_SCALE = 2;
const FONT_FAMILY = "Nunito";
// The container has no system fonts; static weights are used because Skia
// ignores weight requests on the variable font the web app loads.
const FONT_WEIGHTS = [400, 600, 700, 800] as const;
// A past puzzle never changes, so a few recent renders are kept in memory.
const MAX_CACHED_CARDS = 7;

const cardCache = new Map<string, Buffer>();
let fontsRegistered = false;

function registerFonts(): void {
	if (fontsRegistered) return;
	const require = createRequire(import.meta.url);
	for (const weight of FONT_WEIGHTS) {
		const path = require.resolve(
			`@fontsource/nunito/files/nunito-latin-${weight}-normal.woff2`,
		);
		GlobalFonts.registerFromPath(path, FONT_FAMILY);
	}
	fontsRegistered = true;
}

function rememberCard(dateKey: string, png: Buffer): void {
	cardCache.set(dateKey, png);
	const oldest = cardCache.keys().next();
	if (cardCache.size > MAX_CACHED_CARDS && !oldest.done) {
		cardCache.delete(oldest.value);
	}
}

export function renderPuzzleCardPng(card: PuzzleCardInput): Buffer {
	registerFonts();
	const { width, height } = measurePuzzleCard(card);
	const canvas = createCanvas(width * RENDER_SCALE, height * RENDER_SCALE);
	const ctx = canvas.getContext("2d");
	ctx.scale(RENDER_SCALE, RENDER_SCALE);
	drawPuzzleCard(ctx, card, FONT_FAMILY);
	return canvas.toBuffer("image/png");
}

// The untouched board for a day: every cell hidden, letters below. Returns
// null when no puzzle is stored for that date; never generates one.
export async function getDailyPuzzleCardPng(
	dateKey: string,
): Promise<Buffer | null> {
	const cached = cardCache.get(dateKey);
	if (cached) return cached;

	const row = await readDailyPuzzleRow(dateKey);
	if (!row) return null;

	const snapshot = row.publicSnapshotJson;
	const number = getPuzzleNumber(dateKey);
	const date = formatShortPuzzleDate(dateKey);
	const png = renderPuzzleCardPng({
		rows: snapshot.rows,
		cols: snapshot.cols,
		gridMask: snapshot.gridMask,
		letters: snapshot.initialShuffledLetters,
		revealedCells: new Set(),
		title: number === null ? date : `#${number} · ${date}`,
		detail: `${snapshot.wordSlots.length} paraules`,
		stats: [],
	});
	rememberCard(dateKey, png);
	return png;
}
