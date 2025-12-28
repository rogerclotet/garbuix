import type { Configuration } from "lint-staged";

export default {
  "*.{js,jsx,mjs,ts,tsx,json,html,css}": ["pnpm check --write", "pnpm format --write", "pnpm lint --write"],
  "*.{ts,tsx}": [() => "tsc -p tsconfig.json --noEmit"],
  ".biome.json": [() => "biome migrate --write"],
} satisfies Configuration;
