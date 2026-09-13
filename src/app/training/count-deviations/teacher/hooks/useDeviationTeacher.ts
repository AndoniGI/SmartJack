"use client";

import { useCallback, useEffect, useState } from "react";
import { type FinalAction } from "@/data/basicStrategy";
import { type DeviationId } from "@/data/deviations";
import { getDeviationAwareAction, getInsuranceRecommendation } from "@/lib/deviationStrategy";
import { generateScenario, type DeviationScenario } from "../lib/scenarioGenerator";

export const SESSION_LENGTH = 12;

export type TeacherMode = "learn" | "practice";

/** Insurance is a yes/no side bet, not a hit/stand/double/split action — see deviationStrategy.ts. */
export type TeacherAnswer = FinalAction | "insurance" | "no-insurance";

export interface TeacherRepResult {
  scenario: DeviationScenario;
  userAnswer: TeacherAnswer;
  /** Plain basic-strategy baseline: getCorrectAction() for action reps, always "no-insurance" for insurance reps (basic strategy never takes insurance). */
  basicAnswer: TeacherAnswer;
  correctAnswer: TeacherAnswer;
  deviationApplied: boolean;
  isCorrect: boolean;
}

function createSession(): DeviationScenario[] {
  return Array.from({ length: SESSION_LENGTH }, () => generateScenario());
}

/**
 * Level 6 — Deviation Teacher hook.
 *
 * A flashcard-style drill, deliberately separate from full hand play: each
 * rep hands the player a hand + dealer upcard + a stated true count (no
 * shoe, no running count to derive it from — TC is a given fact here, the
 * same way Level 5 owns "convert count to true count" and this level owns
 * "act on it") and asks for the correct play. Grading always computes both
 * the plain basic-strategy answer and the deviation-aware answer so the
 * result screen can show the explicit "basic strategy says X, but at this
 * count Y" comparison.
 */
export function useDeviationTeacher() {
  const [scenarios, setScenarios] = useState<DeviationScenario[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<TeacherAnswer | null>(null);
  const [results, setResults] = useState<TeacherRepResult[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [mode, setModeState] = useState<TeacherMode>("learn");

  // Scenarios use Math.random(); generating them during the initial render
  // would mismatch between server and client render, so — same fix as
  // Level 1's card-values page — they're generated in an effect after mount.
  useEffect(() => {
    setScenarios(createSession());
  }, []);

  const currentScenario = scenarios?.[currentIndex] ?? null;

  const submitAnswer = useCallback(
    (answer: TeacherAnswer) => {
      if (!currentScenario || userAnswer !== null) return;

      let basicAnswer: TeacherAnswer;
      let correctAnswer: TeacherAnswer;
      let deviationApplied: boolean;

      if (currentScenario.rule.trigger.kind === "insurance") {
        basicAnswer = "no-insurance";
        const takeInsurance = getInsuranceRecommendation(currentScenario.trueCount);
        correctAnswer = takeInsurance ? "insurance" : "no-insurance";
        deviationApplied = takeInsurance;
      } else {
        const decision = getDeviationAwareAction(
          currentScenario.playerHand,
          currentScenario.dealerUpcard.rank,
          currentScenario.trueCount,
        );
        basicAnswer = decision.basicAction;
        correctAnswer = decision.finalAction;
        deviationApplied = decision.deviationApplied;
      }

      setUserAnswer(answer);
      setResults((prev) => [
        ...prev,
        {
          scenario: currentScenario,
          userAnswer: answer,
          basicAnswer,
          correctAnswer,
          deviationApplied,
          isCorrect: answer === correctAnswer,
        },
      ]);
    },
    [currentScenario, userAnswer],
  );

  const nextScenario = useCallback(() => {
    if (!scenarios) return;
    if (currentIndex + 1 >= scenarios.length) {
      setIsComplete(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    setUserAnswer(null);
  }, [scenarios, currentIndex]);

  const resetSession = useCallback(() => {
    setScenarios(createSession());
    setCurrentIndex(0);
    setUserAnswer(null);
    setResults([]);
    setIsComplete(false);
  }, []);

  /**
   * Switching guidance level starts a fresh session — a session mixing
   * hinted and un-hinted reps would make the accuracy stat meaningless to
   * read afterward.
   */
  const setMode = useCallback(
    (newMode: TeacherMode) => {
      if (newMode === mode) return;
      setModeState(newMode);
      setScenarios(createSession());
      setCurrentIndex(0);
      setUserAnswer(null);
      setResults([]);
      setIsComplete(false);
    },
    [mode],
  );

  const accuracy = results.length === 0 ? null : Math.round((results.filter((r) => r.isCorrect).length / results.length) * 100);

  const accuracyByRule = (() => {
    const byRule = new Map<DeviationId, { correct: number; total: number; label: string }>();
    for (const result of results) {
      const entry = byRule.get(result.scenario.rule.id) ?? {
        correct: 0,
        total: 0,
        label: result.scenario.rule.label,
      };
      entry.total += 1;
      if (result.isCorrect) entry.correct += 1;
      byRule.set(result.scenario.rule.id, entry);
    }
    return byRule;
  })();

  return {
    sessionLength: SESSION_LENGTH,
    currentScenario,
    currentIndex,
    userAnswer,
    results,
    isComplete,
    accuracy,
    accuracyByRule,
    mode,
    setMode,
    submitAnswer,
    nextScenario,
    resetSession,
  };
}
