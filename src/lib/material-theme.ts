export const MATERIAL_THEME_SEED = "#2a7d6e";

export const appScheme = {
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
${toCssVariables({
	...appScheme.light,
	"game-regular": appScheme.light.primary,
	"game-mini": "#7953a5",
	"game-syllables": "#b84c13",
	"game-quadrat": "#2a5ea8",
})}
}

.dark {
${toCssVariables({
	...appScheme.dark,
	"game-regular": appScheme.dark.primary,
	"game-mini": "#c7a3ed",
	"game-syllables": "#ffb782",
	"game-quadrat": "#a6c8ff",
})}
}

:root[data-game="mini"] {
${toCssVariables({
	background: "#fbf8fc",
	foreground: "#302638",
	card: "#fbf8fc",
	"card-foreground": "#302638",
	popover: "#fbf8fc",
	"popover-foreground": "#302638",
	primary: "var(--game-mini)",
	"primary-foreground": "#ffffff",
	secondary: "#ede4f4",
	"secondary-foreground": "#302638",
	muted: "#f0e9f5",
	"muted-foreground": "#766681",
	accent: "#ede4f4",
	"accent-foreground": "#302638",
	border: "#ded0e9",
	input: "#ded0e9",
	ring: "var(--game-mini)",
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
	primary: "var(--game-mini)",
	"primary-foreground": "#30203f",
	secondary: "#3d2f49",
	"secondary-foreground": "#eee5f5",
	muted: "#33283e",
	"muted-foreground": "#b5a4c2",
	accent: "#3d2f49",
	"accent-foreground": "#eee5f5",
	border: "#4b3a59",
	input: "#4b3a59",
	ring: "var(--game-mini)",
	"mini-gold": "#f2c76a",
	"locate-color": "#9670ba",
})}
}
:root[data-game="syllables"] {
${toCssVariables({
	background: "#fff9f3",
	foreground: "#3c291b",
	card: "#fff9f3",
	"card-foreground": "#3c291b",
	popover: "#fff9f3",
	"popover-foreground": "#3c291b",
	primary: "var(--game-syllables)",
	"primary-foreground": "#ffffff",
	secondary: "#ffe8d5",
	"secondary-foreground": "#3c291b",
	muted: "#fff0e2",
	"muted-foreground": "#806451",
	accent: "#ffe8d5",
	"accent-foreground": "#3c291b",
	border: "#efd4bd",
	input: "#efd4bd",
	ring: "var(--game-syllables)",
	"syllable-star": "#b5680a",
	"locate-color": "#f3b076",
})}
}

:root.dark[data-game="syllables"] {
${toCssVariables({
	background: "#291d16",
	foreground: "#ffead9",
	card: "#291d16",
	"card-foreground": "#ffead9",
	popover: "#291d16",
	"popover-foreground": "#ffead9",
	primary: "var(--game-syllables)",
	"primary-foreground": "#4b260e",
	secondary: "#4b3020",
	"secondary-foreground": "#ffead9",
	muted: "#3e291d",
	"muted-foreground": "#d0ad93",
	accent: "#4b3020",
	"accent-foreground": "#ffead9",
	border: "#65432c",
	input: "#65432c",
	ring: "var(--game-syllables)",
	"syllable-star": "#ffd180",
	"locate-color": "#d4864a",
})}
}

:root[data-game="quadrat"] {
${toCssVariables({
	background: "#f8faff",
	foreground: "#1c2738",
	card: "#f8faff",
	"card-foreground": "#1c2738",
	popover: "#f8faff",
	"popover-foreground": "#1c2738",
	primary: "var(--game-quadrat)",
	"primary-foreground": "#ffffff",
	secondary: "#e2eaf7",
	"secondary-foreground": "#1c2738",
	muted: "#ecf1fa",
	"muted-foreground": "#5b6a80",
	accent: "#e2eaf7",
	"accent-foreground": "#1c2738",
	border: "#d1dcee",
	input: "#d1dcee",
	ring: "var(--game-quadrat)",
	"quadrat-accent": "#a15c07",
	"locate-color": "#9dbbe6",
})}
}

:root.dark[data-game="quadrat"] {
${toCssVariables({
	background: "#161c26",
	foreground: "#e3eaf5",
	card: "#161c26",
	"card-foreground": "#e3eaf5",
	popover: "#161c26",
	"popover-foreground": "#e3eaf5",
	primary: "var(--game-quadrat)",
	"primary-foreground": "#0d2a52",
	secondary: "#27344a",
	"secondary-foreground": "#e3eaf5",
	muted: "#212c3d",
	"muted-foreground": "#a3b2c7",
	accent: "#27344a",
	"accent-foreground": "#e3eaf5",
	border: "#35455e",
	input: "#35455e",
	ring: "var(--game-quadrat)",
	"quadrat-accent": "#f6c46b",
	"locate-color": "#5d82b8",
})}
}
`.trim();

export const miniThemeMetaColors = { light: "#fbf8fc", dark: "#211a29" };

export const materialThemeMetaColors = {
	light: appScheme.light.background,
	dark: appScheme.dark.background,
} as const;

export const syllableThemeMetaColors = { light: "#fff9f3", dark: "#291d16" };

export const quadratThemeMetaColors = { light: "#f8faff", dark: "#161c26" };
