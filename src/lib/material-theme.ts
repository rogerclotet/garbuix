export const MATERIAL_THEME_SEED = "#2a7d6e";

const appScheme = {
	light: {
		background: "#faf8f5",
		foreground: "#2c2825",
		card: "#faf8f5",
		"card-foreground": "#2c2825",
		popover: "#faf8f5",
		"popover-foreground": "#2c2825",
		primary: "#2a7d6e",
		"primary-foreground": "#ffffff",
		secondary: "#e8e2da",
		"secondary-foreground": "#2c2825",
		muted: "#eee9e2",
		"muted-foreground": "#7a7168",
		accent: "#e8e2da",
		"accent-foreground": "#2c2825",
		destructive: "#c4443a",
		"destructive-foreground": "#ffffff",
		border: "#ddd6cc",
		input: "#ddd6cc",
		ring: "#2a7d6e",
		"chart-1": "#5ec4b0",
		"chart-2": "#2a7d6e",
		"chart-3": "#a89e93",
		"chart-4": "#d4a853",
		"chart-5": "#c4443a",
		// Game surfaces and semantic accents used by the redesigned board (behind
		// the mobile-redesign flag): an empty cell and its selected shade, plus
		// pista / paraules extra / ajuda. Pista shares the extra-word pink so it
		// doesn't sit in the orange/warning end of the palette next to destructive.
		"game-cell": "#e7e0d4",
		"game-cell-border": "#d9d0c1",
		"game-cell-active": "#d6cab4",
		"game-cell-active-border": "#c2b49a",
		"game-clue": "#b0568a",
		"game-clue-strong": "#8d3f6b",
		"game-extra": "#b0568a",
		"game-extra-strong": "#8d3f6b",
		"game-social": "#5566bb",
		"game-social-strong": "#3d4c9b",
		sidebar: "#faf8f5",
		"sidebar-foreground": "#2c2825",
		"sidebar-primary": "#2a7d6e",
		"sidebar-primary-foreground": "#ffffff",
		"sidebar-accent": "#e8e2da",
		"sidebar-accent-foreground": "#2c2825",
		"sidebar-border": "#ddd6cc",
		"sidebar-ring": "#2a7d6e",
	},
	dark: {
		background: "#1c1a17",
		foreground: "#e5e0d8",
		card: "#1c1a17",
		"card-foreground": "#e5e0d8",
		popover: "#1c1a17",
		"popover-foreground": "#e5e0d8",
		primary: "#5ec4b0",
		"primary-foreground": "#0f3a32",
		secondary: "#3a352e",
		"secondary-foreground": "#e5e0d8",
		muted: "#322d27",
		"muted-foreground": "#a89e93",
		accent: "#3a352e",
		"accent-foreground": "#e5e0d8",
		destructive: "#f0918a",
		"destructive-foreground": "#3a0c08",
		border: "#3a352e",
		input: "#3a352e",
		ring: "#5ec4b0",
		"chart-1": "#5ec4b0",
		"chart-2": "#2a7d6e",
		"chart-3": "#a89e93",
		"chart-4": "#d4a853",
		"chart-5": "#f0918a",
		"game-cell": "#2b2620",
		"game-cell-border": "#393228",
		"game-cell-active": "#3d3629",
		"game-cell-active-border": "#524839",
		"game-clue": "#dd8fb6",
		"game-clue-strong": "#eeb0cd",
		"game-extra": "#dd8fb6",
		"game-extra-strong": "#eeb0cd",
		"game-social": "#8f97e0",
		"game-social-strong": "#b0b6ee",
		sidebar: "#1c1a17",
		"sidebar-foreground": "#e5e0d8",
		"sidebar-primary": "#5ec4b0",
		"sidebar-primary-foreground": "#0f3a32",
		"sidebar-accent": "#3a352e",
		"sidebar-accent-foreground": "#e5e0d8",
		"sidebar-border": "#3a352e",
		"sidebar-ring": "#5ec4b0",
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
	light: appScheme.light.background,
	dark: appScheme.dark.background,
} as const;
