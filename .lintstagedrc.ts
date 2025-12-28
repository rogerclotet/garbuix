import type { Configuration } from "lint-staged";

export default {
  "*.{js,jsx,ts,tsx}": ["pnpm format"],
  "*.{js,jsx,mjs,ts,tsx,json,html,css}": ["pnpm format"],
  "*.{ts,tsx}": [() => "tsc -p tsconfig.json --noEmit"],
  ".biome.json": ["biome migrate --write"],
} satisfies Configuration;
