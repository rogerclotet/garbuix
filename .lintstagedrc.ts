import type { Configuration } from "lint-staged";

export default {
	"*.{js,jsx,mjs,ts,tsx,json,html,css}": "biome check --write",
} satisfies Configuration;
