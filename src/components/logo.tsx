import type { SVGProps } from "react";

// Standard squircle path (approximated with cubic Bézier curves)
const SQUIRCLE_PATH =
	"M 10 0 C 18 0 20 2 20 10 C 20 18 18 20 10 20 C 2 20 0 18 0 10 C 0 2 2 0 10 0 Z";

/**
 * Logo component representing a capital 'G' with a descender,
 * formed by 10 squircles arranged like cells in a crossword.
 *
 * Shape (3 columns × 5 rows):
 *   ■ ■ ■
 *   ■ . .
 *   ■ . ■
 *   ■ ■ ■
 *   . . ■
 *
 * Color: Uses currentColor for fill, no background.
 */
export function Logo(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 64 108"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="Logo Garbuix!"
			{...props}
		>
			{/* Top bar */}
			<path d={SQUIRCLE_PATH} transform="translate(0, 0)" />
			<path d={SQUIRCLE_PATH} transform="translate(22, 0)" />
			<path d={SQUIRCLE_PATH} transform="translate(44, 0)" />

			{/* Left stem */}
			<path d={SQUIRCLE_PATH} transform="translate(0, 22)" />

			{/* Stem + inner hook */}
			<path d={SQUIRCLE_PATH} transform="translate(0, 44)" />
			<path d={SQUIRCLE_PATH} transform="translate(44, 44)" />

			{/* Bottom bar */}
			<path d={SQUIRCLE_PATH} transform="translate(0, 66)" />
			<path d={SQUIRCLE_PATH} transform="translate(22, 66)" />
			<path d={SQUIRCLE_PATH} transform="translate(44, 66)" />

			{/* Descender */}
			<path d={SQUIRCLE_PATH} transform="translate(44, 88)" />
		</svg>
	);
}

const QUADRAT_LOGO_CELLS = Array.from({ length: 16 }, (_, cell) => cell);
// Wider than the G's gaps, so the cells stay apart at menu-icon size.
const QUADRAT_LOGO_PITCH = 28;

/**
 * Garbuix quadrat's mark: the game's 4×4 board as squircles.
 *
 * Color: Uses currentColor for fill, no background.
 */
export function QuadratLogo(props: SVGProps<SVGSVGElement>) {
	const size = 3 * QUADRAT_LOGO_PITCH + 20;
	return (
		<svg
			viewBox={`0 0 ${size} ${size}`}
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="Logo Garbuix quadrat"
			{...props}
		>
			{QUADRAT_LOGO_CELLS.map((cell) => (
				<path
					key={cell}
					d={SQUIRCLE_PATH}
					transform={`translate(${(cell % 4) * QUADRAT_LOGO_PITCH}, ${Math.floor(cell / 4) * QUADRAT_LOGO_PITCH})`}
				/>
			))}
		</svg>
	);
}
