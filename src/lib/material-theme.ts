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

:root[data-game="mini"] {
${toCssVariables({
	background: "#fbf8fc",
	foreground: "#302638",
	card: "#fbf8fc",
	"card-foreground": "#302638",
	popover: "#fbf8fc",
	"popover-foreground": "#302638",
	primary: "#7953a5",
	"primary-foreground": "#ffffff",
	secondary: "#ede4f4",
	"secondary-foreground": "#302638",
	muted: "#f0e9f5",
	"muted-foreground": "#766681",
	accent: "#ede4f4",
	"accent-foreground": "#302638",
	border: "#ded0e9",
	input: "#ded0e9",
	ring: "#7953a5",
	"mini-gold": "#a36b08",
	"locate-color": "#c4a4e3",
})}
}

:root.dark[data-game="mini"] {
${toCssVariables({
	background: "#211a29",
	foreground: "#eee5f5",
	card: "#211a29",
	"card-foreground": "#eee5f5",
	popover: "#211a29",
	"popover-foreground": "#eee5f5",
	primary: "#c7a3ed",
	"primary-foreground": "#30203f",
	secondary: "#3d2f49",
	"secondary-foreground": "#eee5f5",
	muted: "#33283e",
	"muted-foreground": "#b5a4c2",
	accent: "#3d2f49",
	"accent-foreground": "#eee5f5",
	border: "#4b3a59",
	input: "#4b3a59",
	ring: "#c7a3ed",
	"mini-gold": "#f2c76a",
	"locate-color": "#9670ba",
})}
}
`.trim();

export const miniThemeMetaColors = { light: "#fbf8fc", dark: "#211a29" };

export const materialThemeMetaColors = {
	light: appScheme.light.background,
	dark: appScheme.dark.background,
} as const;
