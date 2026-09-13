/**
 * SmartJack Level 6 count-deviation rules (first 8 — the "starter set").
 *
 * These are read-only overlays on top of basicStrategy.ts, never edits to
 * it: src/lib/deviationStrategy.ts is the only consumer, and it always
 * derives the non-deviation answer from basicStrategy.ts's own functions
 * first, only ever overriding it when a rule here matches and the true
 * count clears its threshold.
 *
 * Data-driven by design: adding a 9th deviation later is one new entry in
 * DEVIATIONS, never a new conditional in the matching logic.
 */

import { type DealerUpcard, type FinalAction } from "./basicStrategy";

export type DeviationId =
  | "insurance"
  | "16v10"
  | "15v10"
  | "1010v5"
  | "1010v6"
  | "10v10"
  | "12v3"
  | "12v2";

/**
 * What a rule matches against.
 * - "insurance" has no hand condition — it only depends on the dealer
 *   showing an Ace, which the caller already knows before offering it.
 * - "hard-total" matches a genuine hard total (never a soft hand reaching
 *   the same number, e.g. A,5 must never match total 16).
 * - "pair" matches the *actual* initial pair, not just a total a fallthrough
 *   hand happens to reach (10,10 vs 5 must not fire for 9,J vs 5, which is
 *   also a hard 20 but not a pair of tens).
 */
export type DeviationTrigger =
  | { kind: "insurance" }
  | { kind: "hard-total"; total: number; dealerUpcard: DealerUpcard }
  | { kind: "pair"; pairRank: "10"; dealerUpcard: DealerUpcard };

/** Insurance is a yes/no side bet, not a hit/stand/double/split action. */
export type DeviationAction = FinalAction | "insurance";

export interface DeviationRule {
  id: DeviationId;
  label: string;
  trigger: DeviationTrigger;
  /** True count at or above which this deviation's action applies ("or higher"). */
  threshold: number;
  action: DeviationAction;
}

export const DEVIATIONS: DeviationRule[] = [
  {
    id: "insurance",
    label: "Insurance",
    trigger: { kind: "insurance" },
    threshold: 3,
    action: "insurance",
  },
  {
    id: "16v10",
    label: "16 vs 10",
    trigger: { kind: "hard-total", total: 16, dealerUpcard: "10" },
    threshold: 0,
    action: "stand",
  },
  {
    id: "15v10",
    label: "15 vs 10",
    trigger: { kind: "hard-total", total: 15, dealerUpcard: "10" },
    threshold: 4,
    action: "stand",
  },
  {
    id: "1010v5",
    label: "10,10 vs 5",
    trigger: { kind: "pair", pairRank: "10", dealerUpcard: "5" },
    threshold: 5,
    action: "split",
  },
  {
    id: "1010v6",
    label: "10,10 vs 6",
    trigger: { kind: "pair", pairRank: "10", dealerUpcard: "6" },
    threshold: 4,
    action: "split",
  },
  {
    id: "10v10",
    label: "10 vs 10",
    trigger: { kind: "hard-total", total: 10, dealerUpcard: "10" },
    threshold: 4,
    action: "double",
  },
  {
    id: "12v3",
    label: "12 vs 3",
    trigger: { kind: "hard-total", total: 12, dealerUpcard: "3" },
    threshold: 2,
    action: "stand",
  },
  {
    id: "12v2",
    label: "12 vs 2",
    trigger: { kind: "hard-total", total: 12, dealerUpcard: "2" },
    threshold: 3,
    action: "stand",
  },
];
