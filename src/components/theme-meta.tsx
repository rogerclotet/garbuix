import { useTheme } from "next-themes";
import { useEffect } from "react";

const THEME_COLORS = {
	light: "#9336ea",
	dark: "#a957f7",
} as const;

type ThemeMode = "light" | "dark";

function getSystemTheme(): ThemeMode {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function resolveTheme(theme?: string, resolvedTheme?: string): ThemeMode {
	if (resolvedTheme === "light" || resolvedTheme === "dark") {
		return resolvedTheme;
	}
	if (theme === "light" || theme === "dark") {
		return theme;
	}
	return getSystemTheme();
}

export function ThemeMeta() {
	const { theme, resolvedTheme } = useTheme();

	useEffect(() => {
		const activeTheme = resolveTheme(theme, resolvedTheme);
		const color = THEME_COLORS[activeTheme];

		let meta = document.querySelector('meta[name="theme-color"]');
		if (!meta) {
			meta = document.createElement("meta");
			meta.setAttribute("name", "theme-color");
			document.head.appendChild(meta);
		}
		meta.setAttribute("content", color);
	}, [theme, resolvedTheme]);

	return null;
}
