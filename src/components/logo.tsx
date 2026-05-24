import type { SVGProps } from "react";

/**
 * Logo component representing a capital 'G' formed by 9 squircles
 * arranged like cells in a crossword.
 *
 * Shape (3 columns × 4 rows):
 *   ■ ■ ■
 *   ■ . .
 *   ■ . ■
 *   ■ ■ ■
 *
 * Color: Uses currentColor for fill, no background.
 */
export function Logo(props: SVGProps<SVGSVGElement>) {
	// Standard squircle path (approximated with cubic Bézier curves)
	const squirclePath =
		"M 10 0 C 18 0 20 2 20 10 C 20 18 18 20 10 20 C 2 20 0 18 0 10 C 0 2 2 0 10 0 Z";

	return (
		<svg
			viewBox="0 0 68 92"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="Logo Garbuix"
			{...props}
		>
			{/* Top bar: 3 squircles */}
			<path d={squirclePath} transform="translate(0, 0)" />
			<path d={squirclePath} transform="translate(24, 0)" />
			<path d={squirclePath} transform="translate(48, 0)" />

			{/* Left stem */}
			<path d={squirclePath} transform="translate(0, 24)" />

			{/* Left stem + right hook */}
			<path d={squirclePath} transform="translate(0, 48)" />
			<path d={squirclePath} transform="translate(48, 48)" />

			{/* Bottom bar: 3 squircles */}
			<path d={squirclePath} transform="translate(0, 72)" />
			<path d={squirclePath} transform="translate(24, 72)" />
			<path d={squirclePath} transform="translate(48, 72)" />
		</svg>
	);
}
