# Paraules

A responsive web application for a Catalan crossword-style word game built with TanStack Start.

## Features

- 🎮 Interactive crossword puzzle game with Catalan words
- 📚 Uses official Catalan dictionary from [Softcatala](https://github.com/Softcatala/catalan-dict-tools)
- 🎯 5-15 words per game, all crossing with each other
- 🔤 Guess words without accents, see them properly spelled
- 📱 Fully responsive design
- 🎨 Modern UI with Tailwind CSS and shadcn/ui components
- 🌓 Dark mode with system preference detection and manual toggle
- ⚡ Fast performance with TanStack Start

## How to Play

1. Look at the crossword grid (letters are hidden initially)
2. Type a word you think appears in the crossword
3. Write words without accents or punctuation (e.g., "pare" instead of "pare")
4. When you guess correctly, the word reveals on the grid
5. Complete the puzzle by finding all words!

## Setup

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Download the Catalan dictionary (required before first run)
pnpm run download-dict

# Start the development server
pnpm run dev
```

The app will be available at `http://localhost:3000`

## Available Scripts

- `pnpm run dev` - Start development server on port 3000
- `pnpm run build` - Build for production (automatically downloads dictionary if missing)
- `pnpm run preview` - Preview production build
- `pnpm run download-dict` - Manually download and process the Catalan dictionary
- `pnpm run format` - Format code with Biome
- `pnpm run lint` - Lint code with Biome
- `pnpm run check` - Check code quality with Biome

## How It Works

### Dictionary Download

The build process automatically:
1. Fetches the latest release from [catalan-dict-tools](https://github.com/Softcatala/catalan-dict-tools)
2. Downloads the `ca.X.X.X-all.zip` file
3. Extracts `catalan.dic` (Hunspell dictionary format)
4. Parses and filters words (3+ letters, letters only)
5. Saves to `src/data/catalan-words.json` (~197k words)

### Crossword Generation

The crossword generator:
- Randomly selects 5-15 valid words
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

## Technologies

- **[TanStack Start](https://tanstack.com/start)** - Full-stack React framework
- **[TanStack Router](https://tanstack.com/router)** - Type-safe routing
- **[React 19](https://react.dev/)** - UI library
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Styling
- **[shadcn/ui](https://ui.shadcn.com/)** - UI components
- **[Lucide React](https://lucide.dev/)** - Icons
- **[Vite](https://vitejs.dev/)** - Build tool
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety

## Data Source

Dictionary data is sourced from:
- **Repository**: [Softcatala/catalan-dict-tools](https://github.com/Softcatala/catalan-dict-tools)
- **License**: LGPL-2.1 / GPL-2.0
- **Format**: Hunspell dictionary format (.dic)
- **Content**: Comprehensive Catalan language word list

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
- Word length filters (default: 3-12 characters)
- Number of placement attempts (default: 50)
- Grid size constraints
- Intersection requirements

### Updating the Dictionary

The dictionary is automatically downloaded during the build process. To manually update:

```bash
pnpm run download-dict
```

This will fetch the latest version from the Softcatala repository.

## License

See [LICENSE](LICENSE)

This project uses dictionary data from Softcatala, which is licensed under LGPL-2.1 and GPL-2.0.

## Contributing

Contributions are welcome! Areas for improvement:
- Better crossword generation algorithms
- Difficulty levels
- Hints system
- Score tracking
- Multiplayer mode
- Word definitions/translations

## Acknowledgments

- **Softcatalà** for maintaining the excellent Catalan dictionary
- **TanStack** team for the amazing React tools
- **shadcn** for the beautiful UI components
