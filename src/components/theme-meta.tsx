import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
	materialThemeMetaColors,
	miniThemeMetaColors,
	quadratThemeMetaColors,
	syllableThemeMetaColors,
} from "@/lib/material-theme";
import type { GameMode } from "@/lib/use-rendered-route";

const THEME_META_COLORS: Record<GameMode, { light: string; dark: string }> = {
	regular: materialThemeMetaColors,
	mini: miniThemeMetaColors,
	syllables: syllableThemeMetaColors,
	quadrat: quadratThemeMetaColors,
};

export function ThemeMeta({ game = "regular" }: { game?: GameMode }) {
	const colors = THEME_META_COLORS[game];
	const { theme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// The saved theme is only available in the browser. Keep the first render
	// consistent with the server's system-theme metadata during hydration.
	useEffect(() => {
		setMounted(true);
	}, []);

	if (mounted && (theme === "light" || theme === "dark")) {
		return <meta name="theme-color" content={colors[theme]} />;
	}

	return (
		<>
			<meta
				name="theme-color"
				media="(prefers-color-scheme: light)"
				content={colors.light}
			/>
			<meta
				name="theme-color"
				media="(prefers-color-scheme: dark)"
				content={colors.dark}
			/>
		</>
	);
}
