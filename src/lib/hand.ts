/**
 * Hand calculation and validation utilities for blackjack.
 *
 * Handles:
 * - Hard and soft total calculation (including multi-card hands)
 * - Hand classification (initial, split, bust, natural)
 * - Action legality (hit, stand, double, split)
 */

export type CardRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type CardSuit = "♠" | "♥" | "♦" | "♣";

export interface Card {
  id: string;
  rank: CardRank;
  suit: CardSuit;
}

export interface Hand {
  cards: Card[];
  status: "playing" | "settled";
  hasSplit: boolean; // true if this hand originated from a split
  hasActed: boolean; // true if at least one action has been taken (hit, double, etc.)
  hasDoubled: boolean; // true if this hand's action was Double (presentation only, e.g. offset the final card)
}

/**
 * Normalize card rank to its numeric value.
 * Face cards (J, Q, K) are treated as 10.
 */
export function rankToValue(rank: CardRank): number {
  if (rank === "A") return 1; // Aces start as 1; we'll add 10 for soft totals
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}

/**
 * Normalize card rank for pair comparison.
 * 10, J, Q, K are all equivalent for splitting purposes.
 */
export function normalizePairRank(rank: CardRank): string {
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return "10";
  return rank;
}

/**
 * Calculate the hard total (all Aces count as 1).
 */
export function calculateHardTotal(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + rankToValue(card.rank), 0);
}

/**
 * Calculate the soft total (one Ace counts as 11 if possible without busting).
 * Returns the soft total if one exists; otherwise returns the hard total.
 */
export function calculateSoftTotal(cards: Card[]): number {
  const hardTotal = calculateHardTotal(cards);

  // Count Aces in hand
  const aceCount = cards.filter((card) => card.rank === "A").length;

  // If no Aces, there's no soft total
  if (aceCount === 0) return hardTotal;

  // Try to count one Ace as 11 (add 10 to hard total)
  const softTotal = hardTotal + 10;

  // If it busts, stay with hard total
  if (softTotal > 21) return hardTotal;

  return softTotal;
}

/**
 * Determine if the current total is a soft total (one Ace counted as 11).
 */
export function isSoftTotal(cards: Card[]): boolean {
  const aceCount = cards.filter((card) => card.rank === "A").length;
  if (aceCount === 0) return false;

  const hardTotal = calculateHardTotal(cards);
  const withAce11 = hardTotal + 10;

  return withAce11 <= 21;
}

/**
 * Get the best total for a hand (soft if available, otherwise hard).
 */
export function getBestTotal(cards: Card[]): number {
  if (isSoftTotal(cards)) {
    return calculateSoftTotal(cards);
  }
  return calculateHardTotal(cards);
}

/**
 * Check if a hand is bust (total > 21).
 */
export function isBust(cards: Card[]): boolean {
  return calculateHardTotal(cards) > 21;
}

/**
 * Check if a hand is a natural blackjack (Ace + 10-value card on initial 2 cards).
 */
export function isNaturalBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;

  const hasAce = cards.some((card) => card.rank === "A");
  const hasTen = cards.some((card) => rankToValue(card.rank) === 10);

  return hasAce && hasTen;
}

/**
 * Check if the hand is an initial pair (exactly 2 cards with matching rank).
 */
export function isInitialPair(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  return normalizePairRank(cards[0].rank) === normalizePairRank(cards[1].rank);
}

/**
 * Check if splitting is legal for this hand.
 * - Must be exactly 2 cards
 * - Must be a matching pair (including 10-value equivalents)
 * - No re-splitting in v1 (so the hand must not have come from a previous split)
 */
export function canSplit(hand: Hand): boolean {
  if (hand.cards.length !== 2) return false;
  if (hand.hasSplit) return false; // v1: no re-splitting

  return isInitialPair(hand.cards);
}

/**
 * Check if doubling is legal for this hand.
 * - Must have exactly 2 cards (initial or first card of a split hand)
 * - Must not have already doubled
 */
export function canDouble(hand: Hand): boolean {
  return hand.cards.length === 2;
}

/**
 * Check if hitting is legal (always true unless hand is settled).
 */
export function canHit(hand: Hand): boolean {
  return hand.status === "playing";
}

/**
 * Check if standing is legal (always true unless hand is settled).
 */
export function canStand(hand: Hand): boolean {
  return hand.status === "playing";
}

/**
 * Get the set of legal actions for a hand.
 */
export function getLegalActions(hand: Hand): Set<"hit" | "stand" | "double" | "split"> {
  const legal = new Set<"hit" | "stand" | "double" | "split">();

  if (hand.status !== "playing") return legal;

  legal.add("hit");
  legal.add("stand");

  if (canDouble(hand)) {
    legal.add("double");
  }

  if (canSplit(hand)) {
    legal.add("split");
  }

  return legal;
}
