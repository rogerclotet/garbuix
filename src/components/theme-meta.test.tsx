// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeMeta } from "@/components/theme-meta";
import { materialThemeMetaColors } from "@/lib/material-theme";

const themeState = vi.hoisted(() => ({ theme: "system" }));

vi.mock("next-themes", () => ({
	useTheme: () => themeState,
}));

beforeEach(() => {
	themeState.theme = "system";
});

afterEach(cleanup);

function themeMetadata() {
	return Array.from(
		document.head.querySelectorAll('meta[name="theme-color"]'),
		(meta) => ({
			content: meta.getAttribute("content"),
			media: meta.getAttribute("media"),
		}),
	);
}

const systemMetadata = [
	{
		content: materialThemeMetaColors.light,
		media: "(prefers-color-scheme: light)",
	},
	{
		content: materialThemeMetaColors.dark,
		media: "(prefers-color-scheme: dark)",
	},
];

describe("ThemeMeta", () => {
	it("can unmount alongside theme metadata owned by another component", () => {
		const view = render(
			<>
				<meta name="theme-color" media="print" content="#ffffff" />
				<ThemeMeta />
			</>,
		);

		expect(() => view.unmount()).not.toThrow();
		expect(
			document.head.querySelectorAll('meta[name="theme-color"]'),
		).toHaveLength(0);
	});

	it("updates browser colors when switching between system, light, and dark", () => {
		const view = render(<ThemeMeta />);
		expect(themeMetadata()).toEqual(systemMetadata);

		for (const theme of ["light", "dark"] as const) {
			themeState.theme = theme;
			view.rerender(<ThemeMeta />);
			expect(themeMetadata()).toEqual([
				{ content: materialThemeMetaColors[theme], media: null },
			]);
		}

		themeState.theme = "system";
		view.rerender(<ThemeMeta />);
		expect(themeMetadata()).toEqual(systemMetadata);
		view.unmount();
		expect(themeMetadata()).toEqual([]);
	});

	it("hydrates server metadata before applying the saved browser theme", async () => {
		function Document() {
			return (
				<html lang="ca">
					<head />
					<body>
						<ThemeMeta />
					</body>
				</html>
			);
		}

		const html = renderToString(<Document />);
		document.documentElement.innerHTML = html;
		expect(themeMetadata()).toEqual(systemMetadata);
		themeState.theme = "dark";
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(document, <Document />, { onRecoverableError });
		try {
			await act(async () => {});
			expect(onRecoverableError).not.toHaveBeenCalled();
			expect(themeMetadata()).toEqual([
				{ content: materialThemeMetaColors.dark, media: null },
			]);
		} finally {
			act(() => root.unmount());
		}
		expect(themeMetadata()).toEqual([]);
	});
});
