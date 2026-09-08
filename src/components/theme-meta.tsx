import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { materialThemeMetaColors } from "@/lib/material-theme";

export function ThemeMeta() {
	const { theme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// The saved theme is only available in the browser. Keep the first render
	// consistent with the server's system-theme metadata during hydration.
	useEffect(() => {
		setMounted(true);
	}, []);

	if (mounted && (theme === "light" || theme === "dark")) {
		return <meta name="theme-color" content={materialThemeMetaColors[theme]} />;
	}

	return (
		<>
			<meta
				name="theme-color"
				media="(prefers-color-scheme: light)"
				content={materialThemeMetaColors.light}
			/>
			<meta
				name="theme-color"
				media="(prefers-color-scheme: dark)"
				content={materialThemeMetaColors.dark}
			/>
		</>
	);
}
