/**
 * Level 6 display formatting — shared by Teacher Mode, Combined Mode, and
 * the Deviation Reference overlay so the "index" language (threshold +
 * action) reads identically everywhere. Purely presentational: never
 * touches DeviationRule.threshold or any grading logic.
 */

import { type DeviationRule } from "@/data/deviations";
import { type FinalAction } from "@/data/basicStrategy";

/** Anything a Teacher-mode rep's answer or answer key can be. */
export type PlayLabel = FinalAction | "insurance" | "no-insurance";

/** "0" -> "0+", "4" -> "+4+", "3" -> "+3+" — sign only when positive, always suffixed to read "or higher". */
export function formatIndexValue(threshold: number): string {
  const signed = threshold > 0 ? `+${threshold}` : `${threshold}`;
  return `${signed}+`;
}

export function formatTrueCount(trueCount: number): string {
  return trueCount > 0 ? `+${trueCount}` : `${trueCount}`;
}

export function actionLabel(action: PlayLabel): string {
  if (action === "insurance") return "Take Insurance";
  if (action === "no-insurance") return "Decline Insurance";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** e.g. "Stand at TC 0+", "Take Insurance at TC +3+" — the Learn-mode hint / reference-overlay line. */
export function formatIndexLabel(rule: DeviationRule): string {
  return `${actionLabel(rule.action)} at TC ${formatIndexValue(rule.threshold)}`;
}
