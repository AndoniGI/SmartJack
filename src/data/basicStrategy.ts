/**
 * SmartJack basic strategy source of truth.
 *
 * Ruleset:
 * - 4–8 decks
 * - Dealer stands on soft 17 (S17)
 * - Double after split allowed (DAS)
 * - No surrender
 * - Standard blackjack payout assumptions (3:2)
 *
 * Strategy basis verified against Wizard of Odds 4–8 deck / S17 basic strategy.
 *
 * IMPORTANT:
 * - "D"  = Double if allowed; otherwise HIT.
 * - "DS" = Double if allowed; otherwise STAND.
 * - Pair table uses only "P" (split) or "N" (do not split).
 *   If a pair entry is "N", the hand must fall through and be evaluated
 *   normally as a hard/soft total.
 */

export const BASIC_STRATEGY_RULES = {
  decks: "4-8",
  dealerSoft17: "stand",
  doubleAfterSplit: true,
  surrender: false,
  blackjackPayout: "3:2",
} as const;

export type DealerUpcard = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "A";
export type StrategyCode = "H" | "S" | "D" | "DS";
export type PairCode = "P" | "N";
export type FinalAction = "hit" | "stand" | "double" | "split";

export const DEALER_UPCARDS: DealerUpcard[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "A",
];

const row = <T extends string>(values: T[]): Record<DealerUpcard, T> =>
  Object.fromEntries(DEALER_UPCARDS.map((card, i) => [card, values[i]])) as Record<DealerUpcard, T>;

/**
 * Hard-total strategy.
 *
 * Totals <= 8 always hit.
 * Totals >= 17 always stand.
 *
 * NOTE: For S17 multi-deck blackjack, hard 11 vs dealer Ace is HIT,
 * not double.
 */
export const HARD_STRATEGY: Record<number, Record<DealerUpcard, StrategyCode>> = {
  9:  row(["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"]),
  10: row(["D", "D", "D", "D", "D", "D", "D", "D", "H", "H"]),
  11: row(["D", "D", "D", "D", "D", "D", "D", "D", "D", "H"]),
  12: row(["H", "H", "S", "S", "S", "H", "H", "H", "H", "H"]),
  13: row(["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"]),
  14: row(["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"]),
  15: row(["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"]),
  16: row(["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"]),
};

/**
 * Soft-total strategy.
 * Keys are the total with one Ace counted as 11.
 *
 * Example:
 * A,7 = soft 18.
 * A,3,4 is ALSO soft 18, so it uses this same row.
 */
export const SOFT_STRATEGY: Record<number, Record<DealerUpcard, StrategyCode>> = {
  13: row(["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"]), // A,2
  14: row(["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"]), // A,3
  15: row(["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"]), // A,4
  16: row(["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"]), // A,5
  17: row(["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"]), // A,6
  18: row(["S", "DS", "DS", "DS", "DS", "S", "S", "H", "H", "H"]), // A,7
  19: row(["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"]), // A,8
  20: row(["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"]), // A,9
};

/**
 * Pair-splitting decision only.
 *
 * "P" = split.
 * "N" = do NOT split; then evaluate the hand as a normal hard/soft total.
 *
 * Because this SmartJack ruleset has DAS enabled, conditional DAS pair
 * decisions are already resolved here.
 */
export const PAIR_STRATEGY: Record<string, Record<DealerUpcard, PairCode>> = {
  A:  row(["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"]),
  "10": row(["N", "N", "N", "N", "N", "N", "N", "N", "N", "N"]),
  "9":  row(["P", "P", "P", "P", "P", "N", "P", "P", "N", "N"]),
  "8":  row(["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"]),
  "7":  row(["P", "P", "P", "P", "P", "P", "N", "N", "N", "N"]),
  "6":  row(["P", "P", "P", "P", "P", "N", "N", "N", "N", "N"]),
  "5":  row(["N", "N", "N", "N", "N", "N", "N", "N", "N", "N"]),
  "4":  row(["N", "N", "N", "P", "P", "N", "N", "N", "N", "N"]),
  "3":  row(["P", "P", "P", "P", "P", "P", "N", "N", "N", "N"]),
  "2":  row(["P", "P", "P", "P", "P", "P", "N", "N", "N", "N"]),
};

/** Convert a card rank into the dealer-upcard column used by the tables. */
export function normalizeDealerUpcard(rank: string): DealerUpcard {
  if (rank === "A") return "A";
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return "10";
  if (["2", "3", "4", "5", "6", "7", "8", "9"].includes(rank)) {
    return rank as DealerUpcard;
  }
  throw new Error(`Unsupported dealer rank: ${rank}`);
}

/** Convert a D / DS entry into the action that is actually legal now. */
function resolveStrategyCode(code: StrategyCode, canDouble: boolean): FinalAction {
  switch (code) {
    case "H":
      return "hit";
    case "S":
      return "stand";
    case "D":
      return canDouble ? "double" : "hit";
    case "DS":
      return canDouble ? "double" : "stand";
  }
}

/**
 * Look up a hard-total decision.
 */
export function getHardAction(
  total: number,
  dealer: DealerUpcard,
  canDouble: boolean,
): FinalAction {
  if (total <= 8) return "hit";
  if (total >= 17) return "stand";

  const code = HARD_STRATEGY[total]?.[dealer];
  if (!code) throw new Error(`No hard strategy entry for total ${total}`);
  return resolveStrategyCode(code, canDouble);
}

/**
 * Look up a soft-total decision.
 */
export function getSoftAction(
  total: number,
  dealer: DealerUpcard,
  canDouble: boolean,
): FinalAction {
  if (total <= 12) return "hit";
  if (total >= 20) return "stand";

  const code = SOFT_STRATEGY[total]?.[dealer];
  if (!code) throw new Error(`No soft strategy entry for total ${total}`);
  return resolveStrategyCode(code, canDouble);
}

/**
 * Decide whether an initial pair should be split.
 *
 * If this returns false, DO NOT treat "don't split" as a final blackjack action.
 * Re-evaluate the same two cards as their normal hard/soft total.
 *
 * Examples:
 * - 10,10 -> don't split -> hard 20 -> stand.
 * - 5,5 vs dealer 6 -> don't split -> hard 10 -> double.
 * - 4,4 vs dealer 10 -> don't split -> hard 8 -> hit.
 */
export function shouldSplitPair(
  pairRank: string,
  dealer: DealerUpcard,
): boolean {
  const normalizedPair =
    pairRank === "J" || pairRank === "Q" || pairRank === "K" ? "10" : pairRank;

  const decision = PAIR_STRATEGY[normalizedPair]?.[dealer];
  if (!decision) throw new Error(`No pair strategy entry for ${pairRank},${pairRank}`);
  return decision === "P";
}
