import { useTheme } from "next-themes";
import { useEffect } from "react";
import { materialThemeMetaColors } from "@/lib/material-theme";

function appendThemeColorMeta(content: string, media?: string) {
	const meta = document.createElement("meta");
	meta.setAttribute("name", "theme-color");
	if (media) meta.setAttribute("media", media);
	meta.setAttribute("content", content);
	document.head.appendChild(meta);
}

export function ThemeMeta() {
	const { theme } = useTheme();

	useEffect(() => {
		for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
			meta.remove();
		}

		if (theme === "light" || theme === "dark") {
			appendThemeColorMeta(materialThemeMetaColors[theme]);
			return;
		}

		appendThemeColorMeta(
			materialThemeMetaColors.light,
			"(prefers-color-scheme: light)",
		);
		appendThemeColorMeta(
			materialThemeMetaColors.dark,
			"(prefers-color-scheme: dark)",
		);
	}, [theme]);

	return null;
}
