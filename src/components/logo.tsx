import type { SVGProps } from "react";

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
	// Standard squircle path (approximated with cubic Bézier curves)
	const squirclePath =
		"M 10 0 C 18 0 20 2 20 10 C 20 18 18 20 10 20 C 2 20 0 18 0 10 C 0 2 2 0 10 0 Z";

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
			<path d={squirclePath} transform="translate(0, 0)" />
			<path d={squirclePath} transform="translate(22, 0)" />
			<path d={squirclePath} transform="translate(44, 0)" />

			{/* Left stem */}
			<path d={squirclePath} transform="translate(0, 22)" />

			{/* Stem + inner hook */}
			<path d={squirclePath} transform="translate(0, 44)" />
			<path d={squirclePath} transform="translate(44, 44)" />

			{/* Bottom bar */}
			<path d={squirclePath} transform="translate(0, 66)" />
			<path d={squirclePath} transform="translate(22, 66)" />
			<path d={squirclePath} transform="translate(44, 66)" />

			{/* Descender */}
			<path d={squirclePath} transform="translate(44, 88)" />
		</svg>
	);
}
