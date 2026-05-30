// PostHog feature flag keys. The flags themselves are created and targeted in
// the PostHog UI; this module is the single source of truth for their keys.

// Gates the AI-generated text clue ("pista") for logged-in players. When off
// (the default), everyone keeps the single-letter reveal.
export const AI_WORD_CLUES_FLAG = "ai-word-clues";

// Gates the prototype circular/hexagon letter layout. When off (the default),
// players keep the two-row 3×2 grid of letter buttons.
export const CIRCLE_LETTERS_FLAG = "circle-letters";
