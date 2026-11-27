import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { Logo } from "../src/components/logo";
import { appScheme } from "../src/lib/material-theme";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const iconsDir = path.join(publicDir, "icons");
const { background, primary } = appScheme.dark;

// Apple and Android apply their own launcher masks to full-bleed artwork.
const squareBackdrop = `<rect width="100" height="100" fill="${background}" />`;
const iconStyles = {
	"rounded-square": {
		backdrop: `<rect width="100" height="100" rx="20" fill="${background}" />`,
		padding: 11,
	},
	squircle: {
		backdrop: `<path d="M 50 0 C 90 0 100 10 100 50 C 100 90 90 100 50 100 C 10 100 0 90 0 50 C 0 10 10 0 50 0 Z" fill="${background}" />`,
		padding: 15,
	},
	square: { backdrop: squareBackdrop, padding: 15 },
	// 14.5% brings the outer cells up to the 40%-radius maskable safe zone.
	maskable: { backdrop: squareBackdrop, padding: 14.5 },
};
type IconShape = keyof typeof iconStyles;

function renderIcon(size: number, shape: IconShape) {
	const { backdrop, padding } = iconStyles[shape];
	const logoSize = 100 - 2 * padding;
	const logo = renderToStaticMarkup(
		createElement(Logo, {
			x: padding,
			y: padding,
			width: logoSize,
			height: logoSize,
			fill: primary,
		}),
	);
	const svg = `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
		${backdrop}
		${logo}
	</svg>`;

	return sharp(Buffer.from(svg)).png();
}

async function generateIcon(filename: string, size: number, shape: IconShape) {
	await renderIcon(size, shape).toFile(path.join(iconsDir, filename));
	console.log(`Generated ${filename} (${size}x${size})`);
}

async function generateFaviconIco() {
	const size = 32;
	const png = await renderIcon(size, "rounded-square").toBuffer();

	// ICO header and directory entry for one PNG-compressed RGBA image.
	const header = Buffer.alloc(22);
	header.writeUInt16LE(1, 2); // Image type: icon
	header.writeUInt16LE(1, 4); // Image count
	header[6] = size;
	header[7] = size;
	header.writeUInt16LE(1, 10); // Color planes
	header.writeUInt16LE(32, 12); // Bits per pixel
	header.writeUInt32LE(png.length, 14);
	header.writeUInt32LE(header.length, 18); // Image offset

	await writeFile(
		path.join(publicDir, "favicon.ico"),
		Buffer.concat([header, png]),
	);
	console.log(`Generated favicon.ico (${size}x${size})`);
}

async function main() {
	await generateIcon("favicon-196.png", 196, "rounded-square");
	for (const size of [120, 152, 167, 180]) {
		await generateIcon(`apple-icon-${size}.png`, size, "square");
	}
	for (const size of [192, 512]) {
		await generateIcon(`manifest-icon-${size}.png`, size, "squircle");
		await generateIcon(`manifest-icon-${size}.maskable.png`, size, "maskable");
	}
	await generateFaviconIco();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
