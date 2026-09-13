/**
 * Deviation-aware strategy wrapper for Level 6.
 *
 * Layers src/data/deviations.ts on top of the untouched basic-strategy
 * source of truth (src/data/basicStrategy.ts via src/lib/strategy.ts).
 * Never modifies either — always computes the plain basic-strategy action
 * first, then overrides it only when a deviation rule matches the hand and
 * the true count clears its threshold.
 */

import { normalizeDealerUpcard, type FinalAction } from "@/data/basicStrategy";
import { DEVIATIONS, type DeviationRule } from "@/data/deviations";
import {
  type Hand,
  type SplitContext,
  isSoftTotal,
  calculateHardTotal,
  normalizePairRank,
  canSplit,
  canDouble,
} from "./hand";
import { getCorrectAction } from "./strategy";

export interface DeviationAwareDecision {
  /** What plain basic strategy (no count) recommends — untouched getCorrectAction(). */
  basicAction: FinalAction;
  /** What's actually correct at this true count — basicAction, or a deviation override. */
  finalAction: FinalAction;
  deviationApplied: boolean;
  rule: DeviationRule | null;
}

function isPlayAction(action: DeviationRule["action"]): action is FinalAction {
  return action !== "insurance";
}

/**
 * The deviation-aware correct action for a hand, given the dealer's upcard
 * and the current true count.
 *
 * Mirrors getCorrectAction's own control flow (pair decision first, then
 * hard/soft total) rather than duplicating it, injecting a deviation check
 * at each branch point:
 *
 * - A pair deviation (10,10 vs 5/6) is only considered on a hand that can
 *   actually still split (canSplit, given `splitContext` — exactly two
 *   matching cards, and legal to split/re-split under the caller's policy),
 *   so it can never recommend an illegal (re-)split.
 * - A hard-total deviation is only considered once the hand is *not*
 *   splitting (basicAction !== "split") and isn't soft — so e.g. 5,5 vs 10
 *   (which basic strategy never splits) is correctly treated as a hard 10
 *   for the 10-vs-10 deviation, while an 8,8 vs 10 (which always splits)
 *   is correctly left alone. A "double" deviation is only applied when the
 *   hand can legally double.
 *
 * `splitContext` governs re-splitting exactly as it does for canSplit/
 * getCorrectAction — omit it for callers that never re-split (Teacher Mode);
 * Level 6 Combined Mode passes the round's live hand count and its 4-hand cap.
 */
export function getDeviationAwareAction(
  hand: Hand,
  dealerUpcardRank: string,
  trueCount: number,
  splitContext?: SplitContext,
): DeviationAwareDecision {
  const dealerUpcard = normalizeDealerUpcard(dealerUpcardRank);
  const basicAction = getCorrectAction(hand, dealerUpcardRank, splitContext);

  if (canSplit(hand, splitContext)) {
    const pairRank = normalizePairRank(hand.cards[0].rank);
    const rule = DEVIATIONS.find(
      (r) => r.trigger.kind === "pair" && r.trigger.pairRank === pairRank && r.trigger.dealerUpcard === dealerUpcard,
    );
    if (rule && isPlayAction(rule.action) && trueCount >= rule.threshold) {
      return { basicAction, finalAction: rule.action, deviationApplied: true, rule };
    }
  }

  if (basicAction !== "split" && !isSoftTotal(hand.cards)) {
    const total = calculateHardTotal(hand.cards);
    const rule = DEVIATIONS.find(
      (r) => r.trigger.kind === "hard-total" && r.trigger.total === total && r.trigger.dealerUpcard === dealerUpcard,
    );
    if (
      rule &&
      isPlayAction(rule.action) &&
      trueCount >= rule.threshold &&
      (rule.action !== "double" || canDouble(hand))
    ) {
      return { basicAction, finalAction: rule.action, deviationApplied: true, rule };
    }
  }

  return { basicAction, finalAction: basicAction, deviationApplied: false, rule: null };
}

/**
 * Whether the count-based Insurance deviation recommends taking it. Plain
 * (non-counting) basic strategy always declines insurance — this is the one
 * true-count check that overrides that blanket "never."
 */
export function getInsuranceRecommendation(trueCount: number): boolean {
  const rule = DEVIATIONS.find((r) => r.trigger.kind === "insurance");
  if (!rule) throw new Error("Insurance deviation rule not found");
  return trueCount >= rule.threshold;
}
