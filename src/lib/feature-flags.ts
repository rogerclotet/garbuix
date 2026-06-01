// PostHog feature flag keys. The flags themselves are created and targeted in
// the PostHog UI; this module is the single source of truth for their keys.

// Gates the prototype circular/hexagon letter layout. When off (the default),
// players keep the two-row 3×2 grid of letter buttons.
export const CIRCLE_LETTERS_FLAG = "circle-letters";

// Gates peer clue requests: a logged-in player who is out of hints can ask other
// connected players for a clue about an unfound word. When off (the default),
// the "demana ajuda" button is hidden and no clue-request stream is opened.
export const PEER_CLUES_FLAG = "peer-clues";
