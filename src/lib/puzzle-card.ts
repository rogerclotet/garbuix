// Draws the puzzle card: the board's shape, the day's letters below it, and
// optional completion stats. The browser share image and the server-rendered
// Reddit image both go through here so the two always look the same. Only the
// 2D canvas API is used, so it runs on a DOM canvas and on @napi-rs/canvas.

import { appScheme } from "@/lib/material-theme";

const CELL_SIZE = 48;
const CELL_GAP = 4;
const PADDING = 24;
const HEADER_HEIGHT = 48;
const DOT_RADIUS = 6;
const LETTERS_TOP_GAP = 20;
const LETTER_SIZE = 48;
const LETTER_GAP = 8;
const STATS_TOP_GAP = 18;
const STATS_HEIGHT = 64;
const STATS_GAP = 8;
const STATS_RADIUS = 10;
const LOGO_HEIGHT = 24;
const WORDMARK = "Garbuix!";
const WORDMARK_GAP = 10;
// Matches the app header, where the wordmark is as tall as the logo.
const WORDMARK_FONT_SIZE = 24;
const HEADER_BASELINE = 22;
// Narrow boards would otherwise squeeze the wordmark, title and detail into
// each other.
const MIN_CONTENT_WIDTH = 440;
// Bézier handle length, as a fraction of the half-side, that traces the CSS
// `corner-shape: squircle` (a superellipse with exponent 4) the board's cells
// use: it puts the curve's midpoint at 2^(-1/4) of the half-side.
const SQUIRCLE_HANDLE = 0.91;

type PuzzleCardColors = {
	background: string;
	brand: string;
	muted: string;
	border: string;
	foreground: string;
	mutedForeground: string;
};

// Always the dark theme, whatever the player's setting, so every shared image
// and Reddit post looks the same. Brand is the teal the dark theme uses for the
// logo.
const COLORS: PuzzleCardColors = {
	background: appScheme.dark.background,
	brand: appScheme.dark.primary,
	muted: appScheme.dark.muted,
	border: appScheme.dark.border,
	foreground: appScheme.dark.foreground,
	mutedForeground: appScheme.dark["muted-foreground"],
};

export type PuzzleCardStat = { value: string; label: string };

export type PuzzleCardInput = {
	rows: number;
	cols: number;
	gridMask: readonly (readonly (unknown | null)[])[];
	letters: readonly string[];
	// "row,col" keys of cells the player has found; drawn filled, never with
	// their letter, so the image is safe to show to people who haven't played.
	revealedCells: ReadonlySet<string>;
	title: string;
	detail: string | null;
	stats: readonly PuzzleCardStat[];
};

// Structural subset of CanvasRenderingContext2D shared by the DOM and
// @napi-rs/canvas, whose context types are otherwise unrelated.
export type PuzzleCardContext = {
	fillStyle: string | object;
	strokeStyle: string | object;
	lineWidth: number;
	globalAlpha: number;
	font: string;
	textAlign: CanvasTextAlign;
	textBaseline: CanvasTextBaseline;
	save(): void;
	restore(): void;
	translate(x: number, y: number): void;
	scale(x: number, y: number): void;
	beginPath(): void;
	closePath(): void;
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
	bezierCurveTo(
		cp1x: number,
		cp1y: number,
		cp2x: number,
		cp2y: number,
		x: number,
		y: number,
	): void;
	arc(
		x: number,
		y: number,
		radius: number,
		startAngle: number,
		endAngle: number,
	): void;
	fill(): void;
	stroke(): void;
	fillRect(x: number, y: number, w: number, h: number): void;
	fillText(text: string, x: number, y: number): void;
	measureText(text: string): { width: number };
};

type PuzzleCardLayout = {
	width: number;
	height: number;
	gridLeft: number;
	gridTop: number;
	gridHeight: number;
	lettersLeft: number;
	lettersTop: number;
	statsTop: number;
	contentWidth: number;
};

function rowWidth(count: number, size: number, gap: number): number {
	return count > 0 ? count * (size + gap) - gap : 0;
}

function layoutPuzzleCard(input: PuzzleCardInput): PuzzleCardLayout {
	const gridWidth = rowWidth(input.cols, CELL_SIZE, CELL_GAP);
	const gridHeight = rowWidth(input.rows, CELL_SIZE, CELL_GAP);
	const lettersWidth = rowWidth(input.letters.length, LETTER_SIZE, LETTER_GAP);
	const contentWidth = Math.max(MIN_CONTENT_WIDTH, gridWidth, lettersWidth);
	const gridTop = PADDING + HEADER_HEIGHT;
	const lettersTop = gridTop + gridHeight + LETTERS_TOP_GAP;
	const lettersBottom =
		input.letters.length > 0 ? lettersTop + LETTER_SIZE : gridTop + gridHeight;
	const statsTop = lettersBottom + STATS_TOP_GAP;
	const statsBottom =
		input.stats.length > 0 ? statsTop + STATS_HEIGHT : lettersBottom;

	return {
		width: contentWidth + PADDING * 2,
		height: statsBottom + PADDING,
		gridLeft: PADDING + (contentWidth - gridWidth) / 2,
		gridTop,
		gridHeight,
		lettersLeft: PADDING + (contentWidth - lettersWidth) / 2,
		lettersTop,
		statsTop,
		contentWidth,
	};
}

export function measurePuzzleCard(input: PuzzleCardInput): {
	width: number;
	height: number;
} {
	const { width, height } = layoutPuzzleCard(input);
	return { width, height };
}

function roundRect(
	ctx: PuzzleCardContext,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function squircle(ctx: PuzzleCardContext, x: number, y: number, size: number) {
	const half = size / 2;
	const handle = half * SQUIRCLE_HANDLE;
	const cx = x + half;
	const cy = y + half;
	const right = x + size;
	const bottom = y + size;

	ctx.beginPath();
	ctx.moveTo(cx, y);
	ctx.bezierCurveTo(cx + handle, y, right, cy - handle, right, cy);
	ctx.bezierCurveTo(right, cy + handle, cx + handle, bottom, cx, bottom);
	ctx.bezierCurveTo(cx - handle, bottom, x, cy + handle, x, cy);
	ctx.bezierCurveTo(x, cy - handle, cx - handle, y, cx, y);
	ctx.closePath();
}

function drawLogo(
	ctx: PuzzleCardContext,
	x: number,
	y: number,
	height: number,
	color: string,
) {
	// The logo SVG viewBox is 64x108. Scale to fit the given height.
	const scale = height / 108;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(scale, scale);
	ctx.fillStyle = color;

	// 10 squircles forming a 'G' with a descender
	const positions = [
		[0, 0],
		[22, 0],
		[44, 0],
		[0, 22],
		[0, 44],
		[44, 44],
		[0, 66],
		[22, 66],
		[44, 66],
		[44, 88],
	] as const;

	for (const [sx, sy] of positions) {
		ctx.beginPath();
		ctx.moveTo(sx + 10, sy);
		ctx.bezierCurveTo(sx + 18, sy, sx + 20, sy + 2, sx + 20, sy + 10);
		ctx.bezierCurveTo(sx + 20, sy + 18, sx + 18, sy + 20, sx + 10, sy + 20);
		ctx.bezierCurveTo(sx + 2, sy + 20, sx, sy + 18, sx, sy + 10);
		ctx.bezierCurveTo(sx, sy + 2, sx + 2, sy, sx + 10, sy);
		ctx.closePath();
		ctx.fill();
	}

	ctx.restore();
}

function drawHeader(
	ctx: PuzzleCardContext,
	input: PuzzleCardInput,
	layout: PuzzleCardLayout,
	colors: PuzzleCardColors,
	fontFamily: string,
) {
	drawLogo(ctx, PADDING, PADDING + 2, LOGO_HEIGHT, colors.brand);

	// Texts of different sizes share a baseline, placed so the wordmark's
	// capitals sit centred on the logo.
	const baseline = PADDING + HEADER_BASELINE;
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
	ctx.font = `bold ${WORDMARK_FONT_SIZE}px ${fontFamily}`;
	const wordmarkX = PADDING + LOGO_HEIGHT + 10;
	ctx.fillStyle = colors.brand;
	ctx.fillText(WORDMARK, wordmarkX, baseline);

	const titleX = wordmarkX + ctx.measureText(WORDMARK).width + WORDMARK_GAP;
	ctx.font = `bold 18px ${fontFamily}`;
	ctx.fillStyle = colors.foreground;
	ctx.fillText(input.title, titleX, baseline);

	if (!input.detail) return;
	ctx.fillStyle = colors.mutedForeground;
	ctx.font = `14px ${fontFamily}`;
	ctx.textAlign = "right";
	ctx.fillText(input.detail, layout.width - PADDING, baseline);
	ctx.textAlign = "left";
}

function drawRevealedCell(
	ctx: PuzzleCardContext,
	x: number,
	y: number,
	colors: PuzzleCardColors,
) {
	ctx.globalAlpha = 0.15;
	ctx.fillStyle = colors.brand;
	squircle(ctx, x, y, CELL_SIZE);
	ctx.fill();

	ctx.globalAlpha = 0.4;
	ctx.strokeStyle = colors.brand;
	ctx.lineWidth = 1.5;
	squircle(ctx, x, y, CELL_SIZE);
	ctx.stroke();

	// A dot instead of the letter keeps the image spoiler-free.
	ctx.globalAlpha = 0.55;
	ctx.fillStyle = colors.brand;
	ctx.beginPath();
	ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, DOT_RADIUS, 0, Math.PI * 2);
	ctx.fill();
	ctx.globalAlpha = 1;
}

function drawHiddenCell(
	ctx: PuzzleCardContext,
	x: number,
	y: number,
	colors: PuzzleCardColors,
) {
	ctx.fillStyle = colors.muted;
	squircle(ctx, x, y, CELL_SIZE);
	ctx.fill();

	ctx.globalAlpha = 0.5;
	ctx.strokeStyle = colors.border;
	ctx.lineWidth = 1;
	squircle(ctx, x, y, CELL_SIZE);
	ctx.stroke();
	ctx.globalAlpha = 1;
}

function drawGrid(
	ctx: PuzzleCardContext,
	input: PuzzleCardInput,
	layout: PuzzleCardLayout,
	colors: PuzzleCardColors,
) {
	for (let rowIdx = 0; rowIdx < input.rows; rowIdx++) {
		for (let colIdx = 0; colIdx < input.cols; colIdx++) {
			if (!input.gridMask[rowIdx]?.[colIdx]) continue;

			const x = layout.gridLeft + colIdx * (CELL_SIZE + CELL_GAP);
			const y = layout.gridTop + rowIdx * (CELL_SIZE + CELL_GAP);
			if (input.revealedCells.has(`${rowIdx},${colIdx}`)) {
				drawRevealedCell(ctx, x, y, colors);
			} else {
				drawHiddenCell(ctx, x, y, colors);
			}
		}
	}
}

// Styled like the board's letter keys: outlined squircles with a bold letter,
// here in the brand teal.
function drawLetters(
	ctx: PuzzleCardContext,
	input: PuzzleCardInput,
	layout: PuzzleCardLayout,
	colors: PuzzleCardColors,
	fontFamily: string,
) {
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = `800 22px ${fontFamily}`;

	input.letters.forEach((letter, index) => {
		const x = layout.lettersLeft + index * (LETTER_SIZE + LETTER_GAP);
		const y = layout.lettersTop;

		ctx.fillStyle = colors.background;
		squircle(ctx, x, y, LETTER_SIZE);
		ctx.fill();

		ctx.strokeStyle = colors.border;
		ctx.lineWidth = 1.5;
		squircle(ctx, x, y, LETTER_SIZE);
		ctx.stroke();

		ctx.fillStyle = colors.brand;
		ctx.fillText(
			letter.toUpperCase(),
			x + LETTER_SIZE / 2,
			y + LETTER_SIZE / 2 + 1,
		);
	});

	ctx.textAlign = "left";
}

function drawStats(
	ctx: PuzzleCardContext,
	input: PuzzleCardInput,
	layout: PuzzleCardLayout,
	colors: PuzzleCardColors,
	fontFamily: string,
) {
	const cardCount = input.stats.length;
	const cardWidth =
		(layout.contentWidth - STATS_GAP * (cardCount - 1)) / cardCount;
	const top = layout.statsTop;

	input.stats.forEach((item, index) => {
		const x = PADDING + index * (cardWidth + STATS_GAP);

		ctx.fillStyle = colors.muted;
		roundRect(ctx, x, top, cardWidth, STATS_HEIGHT, STATS_RADIUS);
		ctx.fill();

		ctx.globalAlpha = 0.6;
		ctx.strokeStyle = colors.border;
		ctx.lineWidth = 1;
		roundRect(ctx, x, top, cardWidth, STATS_HEIGHT, STATS_RADIUS);
		ctx.stroke();
		ctx.globalAlpha = 1;

		const centerX = x + cardWidth / 2;
		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";

		ctx.fillStyle = colors.foreground;
		ctx.font = `600 18px ${fontFamily}, 'Apple Color Emoji', 'Segoe UI Emoji'`;
		ctx.fillText(item.value, centerX, top + 30);

		ctx.fillStyle = colors.mutedForeground;
		ctx.font = `11px ${fontFamily}`;
		ctx.fillText(item.label.toUpperCase(), centerX, top + 50);
	});

	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
}

// Draws at 1 unit per CSS pixel; scale the context first for denser output.
export function drawPuzzleCard(
	ctx: PuzzleCardContext,
	input: PuzzleCardInput,
	fontFamily: string,
): void {
	const colors = COLORS;
	const layout = layoutPuzzleCard(input);

	ctx.fillStyle = colors.background;
	ctx.fillRect(0, 0, layout.width, layout.height);

	drawHeader(ctx, input, layout, colors, fontFamily);
	drawGrid(ctx, input, layout, colors);
	drawLetters(ctx, input, layout, colors, fontFamily);
	if (input.stats.length > 0) {
		drawStats(ctx, input, layout, colors, fontFamily);
	}
}
