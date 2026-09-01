/**
 * Dealer play logic for blackjack with Soft 17 (S17) rule.
 *
 * Dealer:
 * - Hits on hard 16 or below
 * - Stands on hard 17 or above
 * - Stands on soft 17
 */

import { type Card, calculateHardTotal, calculateSoftTotal, isSoftTotal } from "./hand";

/**
 * Determine if the dealer should hit based on S17 rule.
 *
 * @param cards - The dealer's cards
 * @returns true if dealer should hit; false if dealer should stand
 */
export function shouldDealerHit(cards: Card[]): boolean {
  // Get the best total (soft if possible, otherwise hard)
  const isSoft = isSoftTotal(cards);

  if (isSoft) {
    const softTotal = calculateSoftTotal(cards);
    // Dealer stands on soft 17 or higher
    return softTotal < 17;
  } else {
    const hardTotal = calculateHardTotal(cards);
    // Dealer hits on hard 16 or below
    return hardTotal < 17;
  }
}

/**
 * Get the dealer's final total (best of hard and soft).
 *
 * @param cards - The dealer's cards
 * @returns The best total (soft if <= 21 and Ace can be 11, otherwise hard)
 */
export function getDealerTotal(cards: Card[]): number {
  if (isSoftTotal(cards)) {
    return calculateSoftTotal(cards);
  }
  return calculateHardTotal(cards);
}

/**
 * Determine the outcome of a hand vs. the dealer.
 *
 * A 2-card total of 21 and a natural blackjack are not the same thing —
 * a total of 21 reached with 3+ cards must still lose to a dealer natural,
 * so blackjack status (from isNaturalBlackjack, not raw totals) has to be
 * passed in explicitly rather than inferred from playerTotal/dealerTotal.
 *
 * @param playerTotal - The player's best total
 * @param playerBust - Whether the player busted
 * @param dealerTotal - The dealer's best total
 * @param dealerBust - Whether the dealer busted
 * @param playerBlackjack - Whether the player has a natural blackjack
 * @param dealerBlackjack - Whether the dealer has a natural blackjack
 * @returns "win", "loss", or "push"
 */
export function getHandOutcome(
  playerTotal: number,
  playerBust: boolean,
  dealerTotal: number,
  dealerBust: boolean,
  playerBlackjack: boolean,
  dealerBlackjack: boolean,
): "win" | "loss" | "push" {
  // Player busts = loss
  if (playerBust) return "loss";

  // Dealer blackjack: push only if the player also has a natural; otherwise
  // the player loses even if they hold a non-natural 21 from 3+ cards.
  if (dealerBlackjack) return playerBlackjack ? "push" : "loss";

  // Player blackjack against a non-blackjack dealer always wins.
  if (playerBlackjack) return "win";

  // Dealer busts but player doesn't = win
  if (dealerBust) return "win";

  // Both alive: compare totals
  if (playerTotal > dealerTotal) return "win";
  if (playerTotal < dealerTotal) return "loss";
  return "push";
}
