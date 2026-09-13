/**
 * Deviation Teacher scenario generator — Level 6 only, presentation-layer
 * card synthesis for the flashcard drill. No shoe, no persistent state: a
 * fresh random scenario per rep, the same "random draw" spirit as Level 3's
 * generateCard (src/app/training/basic-strategy/hooks/useBasicStrategyGame.ts).
 *
 * Deliberately picks *specific* card combinations rather than any two cards
 * that sum to a total, so every generated hand actually reaches the
 * deviation-eligible branch in getDeviationAwareAction:
 * - Hard-total combos exclude Aces (an Ace-containing 2-card hand is always
 *   evaluated as soft, never hard) and exclude pairs (a pair takes the
 *   split-or-not branch first; for the four hard totals drilled here, the
 *   only same-rank combination that could reach them would misrepresent
 *   the scenario as this drill's plain hard-total case).
 * - The 10,10-pair combos use only ten-value ranks so the hand is always a
 *   genuine initial pair.
 */

import { type Card, type CardRank, type CardSuit, type Hand } from "@/lib/hand";
import { DEVIATIONS, type DeviationRule } from "@/data/deviations";

const SUITS: CardSuit[] = ["♠", "♥", "♦", "♣"];
const TEN_RANKS: CardRank[] = ["10", "J", "Q", "K"];
const INSURANCE_FILLER_RANKS: CardRank[] = ["2", "3", "4", "5", "6", "7", "8", "9"];

/** Non-pair, non-ace rank combinations for each hard total this drill covers. */
const HARD_TOTAL_COMBOS: Record<number, [CardRank, CardRank][]> = {
  10: [
    ["2", "8"],
    ["3", "7"],
    ["4", "6"],
  ],
  12: [
    ["2", "10"],
    ["3", "9"],
    ["4", "8"],
    ["5", "7"],
  ],
  15: [
    ["5", "10"],
    ["6", "9"],
    ["7", "8"],
  ],
  16: [
    ["6", "10"],
    ["7", "9"],
  ],
};

export interface DeviationScenario {
  rule: DeviationRule;
  playerHand: Hand;
  dealerUpcard: Card;
  trueCount: number;
  isAboveThreshold: boolean;
}

function randomFrom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickTwoDistinct<T>(items: readonly T[]): [T, T] {
  const first = randomFrom(items);
  let second = randomFrom(items);
  while (second === first) {
    second = randomFrom(items);
  }
  return [first, second];
}

let cardSeq = 0;
function makeCard(rank: CardRank): Card {
  cardSeq += 1;
  return { id: `drill-${rank}-${cardSeq}`, rank, suit: randomFrom(SUITS) };
}

function makeHand(cards: Card[]): Hand {
  return { cards, status: "playing", hasSplit: false, hasActed: false, hasDoubled: false };
}

function buildHandForRule(rule: DeviationRule): { playerHand: Hand; dealerUpcard: Card } {
  const trigger = rule.trigger;

  if (trigger.kind === "insurance") {
    const [r1, r2] = pickTwoDistinct(INSURANCE_FILLER_RANKS);
    return { playerHand: makeHand([makeCard(r1), makeCard(r2)]), dealerUpcard: makeCard("A") };
  }

  if (trigger.kind === "pair") {
    const r1 = randomFrom(TEN_RANKS);
    const r2 = randomFrom(TEN_RANKS);
    return { playerHand: makeHand([makeCard(r1), makeCard(r2)]), dealerUpcard: makeCard(trigger.dealerUpcard) };
  }

  const combos = HARD_TOTAL_COMBOS[trigger.total];
  if (!combos) throw new Error(`No drill card combos defined for hard total ${trigger.total}`);
  const [r1, r2] = randomFrom(combos);
  return { playerHand: makeHand([makeCard(r1), makeCard(r2)]), dealerUpcard: makeCard(trigger.dealerUpcard) };
}

/**
 * Randomize the rep's true count around the rule's threshold — sometimes at
 * or above it (deviation applies), sometimes below (plain basic strategy
 * still applies) — so the drill teaches the actual boundary rather than
 * letting the player pattern-match "this rule = always deviate."
 */
function randomTrueCountFor(rule: DeviationRule): { trueCount: number; isAboveThreshold: boolean } {
  const isAboveThreshold = Math.random() < 0.6;
  const offset = isAboveThreshold
    ? Math.floor(Math.random() * 3) // threshold, +1, or +2
    : -(1 + Math.floor(Math.random() * 3)); // threshold-1, -2, or -3
  return { trueCount: rule.threshold + offset, isAboveThreshold };
}

export function generateScenario(): DeviationScenario {
  const rule = randomFrom(DEVIATIONS);
  const { playerHand, dealerUpcard } = buildHandForRule(rule);
  const { trueCount, isAboveThreshold } = randomTrueCountFor(rule);
  return { rule, playerHand, dealerUpcard, trueCount, isAboveThreshold };
}
