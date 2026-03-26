import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, "..", "public", "icons");

const TEAL = "#2a7d6e";
const DARK_BG = "#1c1a17";


function maskableLogoSvg(
	fill: string,
	bgColor: string,
	size: number,
): string {
	// Maskable icons need safe zone (80% inner area)
	// Logo native size: 68x92, center it in a square with background
	const padding = size * 0.22; // safe zone padding
	const innerSize = size - padding * 2;
	const logoW = 68;
	const logoH = 92;
	const scale = Math.min(innerSize / logoW, innerSize / logoH);
	const scaledW = logoW * scale;
	const scaledH = logoH * scale;
	const offsetX = (size - scaledW) / 2;
	const offsetY = (size - scaledH) / 2;

	const squirclePath =
		"M 10 0 C 18 0 20 2 20 10 C 20 18 18 20 10 20 C 2 20 0 18 0 10 C 0 2 2 0 10 0 Z";

	const positions = [
		[0, 0], [24, 0], [48, 0],
		[48, 24], [48, 48],
		[24, 48], [0, 48],
		[0, 72],
	];

	const paths = positions
		.map(([x, y]) => `<path d="${squirclePath}" transform="translate(${x}, ${y})" />`)
		.join("\n\t\t");

	return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
		<rect width="${size}" height="${size}" fill="${bgColor}" />
		<g fill="${fill}" transform="translate(${offsetX}, ${offsetY}) scale(${scale})">
		${paths}
		</g>
	</svg>`;
}

function faviconSvg(size: number): string {
	// Rounded square background with the "P" logo centered
	const logoW = 68;
	const logoH = 92;
	const padding = size * 0.18;
	const innerSize = size - padding * 2;
	const scale = Math.min(innerSize / logoW, innerSize / logoH);
	const scaledW = logoW * scale;
	const scaledH = logoH * scale;
	const offsetX = (size - scaledW) / 2;
	const offsetY = (size - scaledH) / 2;
	const cornerRadius = size * 0.2;

	const squirclePath =
		"M 10 0 C 18 0 20 2 20 10 C 20 18 18 20 10 20 C 2 20 0 18 0 10 C 0 2 2 0 10 0 Z";

	const positions = [
		[0, 0], [24, 0], [48, 0],
		[48, 24], [48, 48],
		[24, 48], [0, 48],
		[0, 72],
	];

	const paths = positions
		.map(([x, y]) => `<path d="${squirclePath}" transform="translate(${x}, ${y})" />`)
		.join("\n\t\t");

	return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
		<rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${DARK_BG}" />
		<g fill="#ffffff" transform="translate(${offsetX}, ${offsetY}) scale(${scale})">
		${paths}
		</g>
	</svg>`;
}

async function generateIcon(svg: string, outputPath: string, size: number) {
	await sharp(Buffer.from(svg))
		.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(outputPath);
	console.log(`  Generated: ${path.basename(outputPath)} (${size}x${size})`);
}

async function main() {
	console.log("Generating app icons with teal theme...\n");

	// Favicon 196 — dark rounded square bg with white logo
	const favicon196Svg = faviconSvg(196);
	await generateIcon(favicon196Svg, path.join(iconsDir, "favicon-196.png"), 196);

	// Maskable icons — dark bg, teal logo (matches dark PWA chrome)
	const maskable192Svg = maskableLogoSvg(TEAL, DARK_BG, 192);
	await generateIcon(maskable192Svg, path.join(iconsDir, "manifest-icon-192.maskable.png"), 192);

	const maskable512Svg = maskableLogoSvg(TEAL, DARK_BG, 512);
	await generateIcon(maskable512Svg, path.join(iconsDir, "manifest-icon-512.maskable.png"), 512);

	// Apple icon 180 — dark bg, teal logo
	const apple180Svg = maskableLogoSvg(TEAL, DARK_BG, 180);
	await generateIcon(apple180Svg, path.join(iconsDir, "apple-icon-180.png"), 180);

	// Generate favicon.ico from a 32px version
	const favicon32 = faviconSvg(32);
	await sharp(Buffer.from(favicon32))
		.resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(path.join(iconsDir, "..", "favicon.ico"));
	console.log(`  Generated: favicon.ico (32x32)`);

	console.log("\nDone!");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
