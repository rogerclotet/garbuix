import type { DailyPuzzlePublic } from "@/lib/puzzle-types";

const CELL_SIZE = 48;
const CELL_GAP = 4;
const CELL_RADIUS = 6;
const PADDING = 24;
const HEADER_HEIGHT = 48;
const FOOTER_HEIGHT = 32;
const DOT_RADIUS = 6;

function formatShareDate(dateKey: string): string {
	const [year, month, day] = dateKey.split("-");

	if (!year || !month || !day) {
		return dateKey;
	}

	return `${day}/${month}/${year}`;
}

function getCSSColor(varName: string, fallback: string): string {
	if (typeof document === "undefined") return fallback;
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(varName)
		.trim();
	return value || fallback;
}

function resolveColor(raw: string): string {
	// oklch(...) values need to be resolved through a temp element
	if (raw.startsWith("oklch(") || raw.startsWith("hsl(")) {
		const el = document.createElement("div");
		el.style.color = raw;
		document.body.appendChild(el);
		const resolved = getComputedStyle(el).color;
		document.body.removeChild(el);
		return resolved;
	}
	return raw;
}

function hexFromResolved(colorStr: string): string {
	const el = document.createElement("canvas").getContext("2d");
	if (!el) return colorStr;
	el.fillStyle = colorStr;
	return el.fillStyle;
}

function getThemeColors() {
	const bg = resolveColor(getCSSColor("--background", "#ffffff"));
	const primary = resolveColor(getCSSColor("--primary", "#2563eb"));
	const muted = resolveColor(getCSSColor("--muted", "#f1f5f9"));
	const border = resolveColor(getCSSColor("--border", "#e2e8f0"));
	const foreground = resolveColor(getCSSColor("--foreground", "#0f172a"));
	const mutedFg = resolveColor(getCSSColor("--muted-foreground", "#64748b"));

	return {
		bg: hexFromResolved(bg),
		primary: hexFromResolved(primary),
		muted: hexFromResolved(muted),
		border: hexFromResolved(border),
		foreground: hexFromResolved(foreground),
		mutedFg: hexFromResolved(mutedFg),
	};
}

function drawLogo(
	ctx: CanvasRenderingContext2D,
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

	// 10 squircles at specific positions forming a 'G' with a descender
	const positions = [
		[0, 0],
		[22, 0],
		[44, 0], // top bar
		[0, 22], // left stem
		[0, 44],
		[44, 44], // stem + hook
		[0, 66],
		[22, 66],
		[44, 66], // bottom bar
		[44, 88], // descender
	];

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

function roundRect(
	ctx: CanvasRenderingContext2D,
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

export function renderProgressCanvas(
	puzzle: DailyPuzzlePublic,
	revealedCells: Set<string>,
	guessedCount: number,
	totalWords: number,
): HTMLCanvasElement {
	const colors = getThemeColors();
	const gridW = puzzle.cols * (CELL_SIZE + CELL_GAP) - CELL_GAP;
	const gridH = puzzle.rows * (CELL_SIZE + CELL_GAP) - CELL_GAP;
	const canvasW = gridW + PADDING * 2;
	const canvasH = gridH + PADDING * 2 + HEADER_HEIGHT + FOOTER_HEIGHT;

	const dpr = Math.min(window.devicePixelRatio || 1, 3);
	const canvas = document.createElement("canvas");
	canvas.width = canvasW * dpr;
	canvas.height = canvasH * dpr;
	canvas.style.width = `${canvasW}px`;
	canvas.style.height = `${canvasH}px`;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Canvas 2D context is unavailable.");
	}
	ctx.scale(dpr, dpr);

	// Background
	ctx.fillStyle = colors.bg;
	ctx.fillRect(0, 0, canvasW, canvasH);

	// Header: logo + date
	drawLogo(ctx, PADDING, PADDING + 2, 24, colors.foreground);

	ctx.fillStyle = colors.foreground;
	ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
	ctx.textBaseline = "middle";
	ctx.fillText(
		formatShareDate(puzzle.dateKey),
		PADDING + 24 + 10,
		PADDING + 14,
	);

	ctx.fillStyle = colors.mutedFg;
	ctx.font = "14px system-ui, -apple-system, sans-serif";
	ctx.textAlign = "right";
	ctx.fillText(
		`${guessedCount} / ${totalWords} paraules`,
		canvasW - PADDING,
		PADDING + 14,
	);
	ctx.textAlign = "left";

	const gridOffsetY = PADDING + HEADER_HEIGHT;

	// Draw grid
	for (let rowIdx = 0; rowIdx < puzzle.rows; rowIdx++) {
		for (let colIdx = 0; colIdx < puzzle.cols; colIdx++) {
			const cell = puzzle.gridMask[rowIdx]?.[colIdx];
			if (!cell) continue;

			const x = PADDING + colIdx * (CELL_SIZE + CELL_GAP);
			const y = gridOffsetY + rowIdx * (CELL_SIZE + CELL_GAP);
			const key = `${rowIdx},${colIdx}`;
			const isRevealed = revealedCells.has(key);

			// Cell background
			if (isRevealed) {
				ctx.globalAlpha = 0.15;
				ctx.fillStyle = colors.primary;
				roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
				ctx.fill();
				ctx.globalAlpha = 1;

				// Border
				ctx.globalAlpha = 0.4;
				ctx.strokeStyle = colors.primary;
				ctx.lineWidth = 1.5;
				roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
				ctx.stroke();
				ctx.globalAlpha = 1;

				// Dot instead of letter
				ctx.fillStyle = colors.primary;
				ctx.globalAlpha = 0.55;
				ctx.beginPath();
				ctx.arc(
					x + CELL_SIZE / 2,
					y + CELL_SIZE / 2,
					DOT_RADIUS,
					0,
					Math.PI * 2,
				);
				ctx.fill();
				ctx.globalAlpha = 1;
			} else {
				ctx.fillStyle = colors.muted;
				roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
				ctx.fill();

				ctx.globalAlpha = 0.5;
				ctx.strokeStyle = colors.border;
				ctx.lineWidth = 1;
				roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
		}
	}

	// Footer
	ctx.fillStyle = colors.mutedFg;
	ctx.font = "12px system-ui, -apple-system, sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(
		"garbuix.clotet.dev",
		canvasW / 2,
		gridOffsetY + gridH + FOOTER_HEIGHT / 2 + 10,
	);
	ctx.textAlign = "left";

	return canvas;
}

export type ShareResult = "shared" | "copied" | "downloaded";

export async function shareProgress(
	puzzle: DailyPuzzlePublic,
	revealedCells: Set<string>,
	guessedCount: number,
	totalWords: number,
): Promise<ShareResult> {
	const canvas = renderProgressCanvas(
		puzzle,
		revealedCells,
		guessedCount,
		totalWords,
	);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => {
			if (b) resolve(b);
			else reject(new Error("Failed to create image"));
		}, "image/png");
	});

	const text = `${guessedCount}/${totalWords} https://garbuix.clotet.dev`;

	if (
		typeof navigator !== "undefined" &&
		typeof navigator.share === "function" &&
		typeof navigator.canShare === "function"
	) {
		const file = new File([blob], `garbuix-${puzzle.dateKey}.png`, {
			type: "image/png",
		});
		const shareData: ShareData = { text, files: [file] };

		if (navigator.canShare(shareData)) {
			try {
				await navigator.share(shareData);
				return "shared";
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return "shared";
				}
			}
		}
	}

	// Fallback: copy image to clipboard
	try {
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		return "copied";
	} catch {
		// Last resort: download
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `garbuix-${puzzle.dateKey}.png`;
		a.click();
		URL.revokeObjectURL(url);
		return "downloaded";
	}
}
