/**
 * Strategy decision wrapper for blackjack.
 *
 * Uses basicStrategy.ts as the authoritative source of truth.
 * Handles action legality and fallback rules.
 */

import {
  normalizeDealerUpcard,
  getHardAction,
  getSoftAction,
  shouldSplitPair,
  type DealerUpcard,
  type FinalAction,
} from "@/data/basicStrategy";
import {
  type Hand,
  type Card,
  isBust,
  isNaturalBlackjack,
  isInitialPair,
  calculateHardTotal,
  calculateSoftTotal,
  isSoftTotal,
  getBestTotal,
  normalizePairRank,
  canDouble,
  canSplit,
  canHit,
  canStand,
} from "./hand";

/**
 * Get the correct basic-strategy action for a given hand and dealer upcard.
 *
 * Returns the action that basic strategy recommends.
 * Callers are responsible for:
 * - Checking action legality via getLegalActions()
 * - Applying the user's chosen action (even if incorrect)
 *
 * @param hand - The player's hand
 * @param dealerUpcardRank - The dealer's upcard rank
 * @throws if hand is bust or settled, or if hand has no cards
 */
export function getCorrectAction(hand: Hand, dealerUpcardRank: string): FinalAction {
  if (hand.cards.length === 0) {
    throw new Error("Cannot get strategy for hand with no cards");
  }

  if (isBust(hand.cards)) {
    throw new Error("Cannot get strategy for bust hand");
  }

  // Normalize dealer upcard
  const dealerUpcard = normalizeDealerUpcard(dealerUpcardRank);

  // Check for natural blackjack (settled automatically, no decision)
  if (isNaturalBlackjack(hand.cards)) {
    throw new Error("Natural blackjack should be settled automatically, no strategy decision needed");
  }

  // Check for pair (only on exactly 2 cards)
  if (isInitialPair(hand.cards)) {
    const pairRank = normalizePairRank(hand.cards[0].rank);
    const shouldSplit = shouldSplitPair(pairRank, dealerUpcard);

    if (shouldSplit) {
      return "split";
    }
    // If not splitting, fall through to evaluate as hard/soft total
  }

  // Determine if the hand can double (exactly 2 cards)
  const canDoubleThisHand = canDouble(hand);

  // Get the best total for the hand
  const isSoft = isSoftTotal(hand.cards);

  if (isSoft) {
    // Soft total: use soft strategy
    const total = calculateSoftTotal(hand.cards);
    return getSoftAction(total, dealerUpcard, canDoubleThisHand);
  } else {
    // Hard total: use hard strategy
    const total = calculateHardTotal(hand.cards);
    return getHardAction(total, dealerUpcard, canDoubleThisHand);
  }
}

/**
 * Get the set of legal actions for a hand.
 */
export function getLegalActionsForHand(hand: Hand): Set<FinalAction> {
  const legal = new Set<FinalAction>();

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

/**
 * Check if an action is legal for the current hand.
 */
export function isActionLegal(hand: Hand, action: FinalAction): boolean {
  return getLegalActionsForHand(hand).has(action);
}
