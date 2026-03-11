export const MATERIAL_THEME_SEED = "#9336ea";

const appScheme = {
	light: {
		background: "#fffbff",
		foreground: "#1d1b1e",
		card: "#fffbff",
		"card-foreground": "#1d1b1e",
		popover: "#fffbff",
		"popover-foreground": "#1d1b1e",
		primary: "#8521dc",
		"primary-foreground": "#ffffff",
		secondary: "#edddf6",
		"secondary-foreground": "#21182a",
		muted: "#e9dfeb",
		"muted-foreground": "#4a454e",
		accent: "#edddf6",
		"accent-foreground": "#21182a",
		destructive: "#ba1a1a",
		"destructive-foreground": "#ffffff",
		border: "#ccc4ce",
		input: "#ccc4ce",
		ring: "#8521dc",
		"chart-1": "#dcb8ff",
		"chart-2": "#b06cff",
		"chart-3": "#9b8ca5",
		"chart-4": "#c2848c",
		"chart-5": "#8521dc",
		sidebar: "#fffbff",
		"sidebar-foreground": "#1d1b1e",
		"sidebar-primary": "#8521dc",
		"sidebar-primary-foreground": "#ffffff",
		"sidebar-accent": "#edddf6",
		"sidebar-accent-foreground": "#21182a",
		"sidebar-border": "#ccc4ce",
		"sidebar-ring": "#8521dc",
	},
	dark: {
		background: "#1d1b1e",
		foreground: "#e7e1e5",
		card: "#1d1b1e",
		"card-foreground": "#e7e1e5",
		popover: "#1d1b1e",
		"popover-foreground": "#e7e1e5",
		primary: "#dcb8ff",
		"primary-foreground": "#490081",
		secondary: "#4d4357",
		"secondary-foreground": "#edddf6",
		muted: "#4a454e",
		"muted-foreground": "#ccc4ce",
		accent: "#4d4357",
		"accent-foreground": "#edddf6",
		destructive: "#ffb4ab",
		"destructive-foreground": "#690005",
		border: "#4a454e",
		input: "#4a454e",
		ring: "#dcb8ff",
		"chart-1": "#dcb8ff",
		"chart-2": "#b06cff",
		"chart-3": "#d0c1da",
		"chart-4": "#f3b7be",
		"chart-5": "#8521dc",
		sidebar: "#1d1b1e",
		"sidebar-foreground": "#e7e1e5",
		"sidebar-primary": "#dcb8ff",
		"sidebar-primary-foreground": "#490081",
		"sidebar-accent": "#4d4357",
		"sidebar-accent-foreground": "#edddf6",
		"sidebar-border": "#4a454e",
		"sidebar-ring": "#dcb8ff",
	},
} as const;

function toCssVariables(tokens: Record<string, string>) {
	return Object.entries(tokens)
		.map(([name, value]) => `\t--${name}: ${value};`)
		.join("\n");
}

export const materialThemeCss = `
:root {
${toCssVariables(appScheme.light)}
}

.dark {
${toCssVariables(appScheme.dark)}
}
`.trim();

export const materialThemeMetaColors = {
	light: appScheme.light.primary,
	dark: appScheme.dark.primary,
} as const;
