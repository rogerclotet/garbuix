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

type IconShape = "squircle" | "square" | "maskable";

function renderIcon(size: number, shape: IconShape) {
	// 14.5% brings the outer cells up to the 40%-radius maskable safe zone.
	const padding = shape === "maskable" ? 14.5 : 15;
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
	// Apple and Android apply their own launcher masks to full-bleed artwork.
	const backdrop =
		shape === "squircle"
			? `<path d="M 50 0 C 90 0 100 10 100 50 C 100 90 90 100 50 100 C 10 100 0 90 0 50 C 0 10 10 0 50 0 Z" fill="${background}" />`
			: `<rect width="100" height="100" fill="${background}" />`;

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
	const png = await renderIcon(size, "squircle").toBuffer();

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
	await generateIcon("favicon-196.png", 196, "squircle");
	await generateIcon("apple-icon-180.png", 180, "square");
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
