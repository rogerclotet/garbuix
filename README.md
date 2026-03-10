# Paraules

A responsive web application for a Catalan crossword-style word game.

## Features

- 🎮 Interactive crossword puzzle game with Catalan words
- 📚 Uses a general Catalan lexicon from [Softcatalà](https://github.com/Softcatala/catalan-dict-tools)
- 🎯 5-15 words per game, all crossing with each other
- 🔤 Guess words without accents, see them properly spelled
- 📱 Fully responsive design
- 🎨 Modern UI with Tailwind CSS and shadcn/ui components
- 🌓 Dark mode with system preference detection and manual toggle

## How to Play

1. Look at the crossword grid (letters are hidden initially)
2. Type a word you think appears in the crossword
3. When you guess correctly, the word reveals on the grid
4. Complete the puzzle by finding all words!

## Setup

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Download the Catalan dictionary (required before first run)
pnpm download-dict

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`

## Available Scripts

- `pnpm run dev` - Start development server on port 3000
- `pnpm run build` - Build for production (automatically downloads dictionary if missing)
- `pnpm run preview` - Preview production build
- `pnpm run download-dict` - Force-refresh and rebuild the Catalan dictionary
- `pnpm run format` - Format code with Biome
- `pnpm run lint` - Lint code with Biome
- `pnpm run check` - Check code quality with Biome
- `pnpm run typecheck` - Check TypeScript types

## How It Works

### Dictionary Download

The build process automatically:
1. Fetches general lexical data from Softcatalà's `catalan-dict-tools` repository
2. Combines nouns, adjectives, verbs, adverbs, and lemma frequency data
3. Filters to crossword-friendly entries (4-12 letters, alphabetic, common enough to be useful)
4. Saves the result to `src/data/catalan-words.json` (currently ~14.5k words)

### Crossword Generation

The crossword generator:
- Randomly selects 10-15 valid words
- Places the first word horizontally
- Finds intersections for subsequent words
- Ensures all words cross with at least one other word
- Creates a compact grid layout
- Falls back to simpler layouts if complex generation fails

### Word Matching

- User input is normalized (accents removed, lowercase)
- Dictionary words are stored with proper spelling
- Matching is accent-insensitive
- Display shows correctly spelled words

### Word Selection Quality

- The dictionary source is a general lexicon instead of a terminology database
- Low-frequency words are filtered out during the build step (currently `frequency >= 200`)
- Puzzle generation prefers more common words, while keeping some randomness

## Technologies

- **[TanStack Start](https://tanstack.com/start)** - Full-stack React framework
- **[TanStack Router](https://tanstack.com/router)** - Type-safe routing
- **[React 19](https://react.dev/)** - UI library
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Styling
- **[shadcn/ui](https://ui.shadcn.com/)** - UI components
- **[Lucide React](https://lucide.dev/)** - Icons
- **[Vite](https://vitejs.dev/)** - Build tool
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety

## Development Notes

### Adding New UI Components

Use shadcn CLI to add components:

```bash
pnpm dlx shadcn@latest add [component-name]
```

### Code Style

This project uses `@/` path aliases for imports:
```typescript
import { Button } from "@/components/ui/button"
import { generateCrossword } from "@/lib/crossword-generator"
import allWords from "@/data/catalan-words.json"
```

The `@/` alias maps to the `src/` directory (configured in `tsconfig.json`).

### Dark Mode

The app supports dark mode with automatic system preference detection:

- **System Default**: Follows your OS dark mode setting
- **Manual Toggle**: Click the sun/moon icon in the header to override
- **Persistent**: Your preference is saved to localStorage

The theme is managed by `ThemeProvider` in `src/components/theme-provider.tsx`.

### Customizing Crossword Generation

Edit `src/lib/crossword-generator.ts` to adjust:
- Word length filters (default: 4-12 characters)
- Number of placement attempts (default: 50)
- Grid size constraints
- Intersection requirements

### Updating the Dictionary

The build only downloads the dictionary if `src/data/catalan-words.json` is missing.
To force a refresh from the upstream source:

```bash
pnpm run download-dict
```

This will fetch the latest source files from Softcatalà and rebuild the local JSON.

## Contributing

Contributions are welcome! Feel free to submit pull requests or open issues.

## Acknowledgments

- **Softcatalà** for maintaining and publishing open Catalan lexical data
- **TanStack** team for the amazing React tools
- **shadcn** for the beautiful UI components
