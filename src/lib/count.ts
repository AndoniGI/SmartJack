import { type CardRank } from "./hand";

/**
 * Hi-Lo card-counting value for a single card:
 * 2-6 = +1, 7-9 = 0, 10/J/Q/K/A = -1.
 */
export function hiLoValue(rank: CardRank): number {
  switch (rank) {
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
      return 1;
    case "7":
    case "8":
    case "9":
      return 0;
    default:
      return -1; // 10, J, Q, K, A
  }
}

/**
 * SmartJack's training convention for decks remaining: rounded to the
 * nearest half deck. Mirrors how a real player estimates the shoe by eye —
 * used both as the answer key for a deck-estimation question and as the
 * divisor for true count, so the two stay consistent with each other.
 */
export function roundToNearestHalfDeck(decksRemaining: number): number {
  return Math.round(decksRemaining * 2) / 2;
}

// Floor for the true-count divisor so a near-empty shoe can't divide by (or
// near) zero. Decks remaining should already be rounded to a half deck by
// the caller (see roundToNearestHalfDeck) before reaching this function.
const MIN_DECKS_REMAINING = 0.5;

/**
 * SmartJack's true-count convention: running count divided by decks
 * remaining, truncated toward zero (not floored/rounded) so positive and
 * negative counts truncate symmetrically — e.g. -5 / 1.5 = -3, not -4.
 * This is the one true-count rule the whole app (Level 5 on) teaches
 * against, including future count-deviation levels.
 */
export function trueCount(runningCount: number, decksRemaining: number): number {
  const safeDecks = Math.max(decksRemaining, MIN_DECKS_REMAINING);
  const truncated = Math.trunc(runningCount / safeDecks);
  return truncated === 0 ? 0 : truncated; // normalize -0 to 0
}
