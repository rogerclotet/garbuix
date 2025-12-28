import type { SVGProps } from "react";

/**
 * Logo component representing a capital 'P' formed by 8 squircles.
 *
 * Shape description:
 * - A horizontal line on top with 3 squircles.
 * - 2 down on the right.
 * - 2 left from there (forming the loop).
 * - 1 down from there (forming the stem).
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
			aria-label="Logo Paraules"
			{...props}
		>
			{/* Horizontal line on top: 3 squircles */}
			<path d={squirclePath} transform="translate(0, 0)" />
			<path d={squirclePath} transform="translate(24, 0)" />
			<path d={squirclePath} transform="translate(48, 0)" />

			{/* 2 down on the right */}
			<path d={squirclePath} transform="translate(48, 24)" />
			<path d={squirclePath} transform="translate(48, 48)" />

			{/* 2 left from there */}
			<path d={squirclePath} transform="translate(24, 48)" />
			<path d={squirclePath} transform="translate(0, 48)" />

			{/* 1 down from there (stem) */}
			<path d={squirclePath} transform="translate(0, 72)" />
		</svg>
	);
}
