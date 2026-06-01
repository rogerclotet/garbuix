// PostHog feature flag keys. The flags themselves are created and targeted in
// the PostHog UI; this module is the single source of truth for their keys.

// Gates the AI-generated text clue ("pista") for logged-in players. When off
// (the default), everyone keeps the single-letter reveal.
export const AI_WORD_CLUES_FLAG = "ai-word-clues";

// Gates peer clue requests: a logged-in player who is out of hints can ask other
// connected players for a clue about an unfound word. When off (the default),
// the "demana ajuda" button is hidden and no clue-request stream is opened.
export const PEER_CLUES_FLAG = "peer-clues";
