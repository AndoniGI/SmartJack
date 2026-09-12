"use client";

import { useCallback, useRef, useState } from "react";
import { createShoe, type Shoe } from "@/lib/shoe";
import { hiLoValue, roundToNearestHalfDeck, trueCount } from "@/lib/count";
import { type Card } from "@/lib/hand";
import { useBlackjackSession } from "@/lib/blackjackSession";

export const SHOE_DECK_COUNT = 6;
export const SESSION_LENGTH = 12;
export const CHECKPOINT_INTERVAL = 3;

const CARDS_PER_DECK = 52;
const TOTAL_SHOE_CARDS = SHOE_DECK_COUNT * CARDS_PER_DECK;

// "decks-remaining" is a display-only step now (see submitRunningCountAnswer
// below) — the shoe isn't reliable enough for the player to estimate it
// themselves, so we just tell them, then ask for the true count.
export type CheckpointStage = "running-count" | "decks-remaining" | "true-count";

export interface CheckpointAnswerBreakdown {
  userAnswer: number;
  actual: number;
  isCorrect: boolean;
}

export interface TrueCountCheckpointResult {
  afterHand: number; // completedHandCount at the time of this checkpoint
  runningCount: CheckpointAnswerBreakdown;
  trueCount: CheckpointAnswerBreakdown;
  // The real, rounded decks-remaining figure shown to the player before the
  // true-count question — not graded (the player never estimates it), but
  // surfaced on the result screen for context.
  decksRemainingShown: number;
  /**
   * Diagnostic only — never part of True Count Accuracy (see trueCount
   * above, which is graded against the shoe's actual true count). True when
   * trunc(their own RC / the shown decks-remaining) equals their own
   * true-count answer, using SmartJack's convention (src/lib/count.ts). Lets
   * a player whose method is right but whose running-count input was wrong
   * see that distinction on the result screen, instead of one flat "wrong."
   */
  conversionCorrect: boolean;
}

/**
 * Level 5 (True Count) game hook.
 *
 * Wraps the shared round engine (useBlackjackSession — same one Levels 3
 * and 4 use) with its own persistent 6-deck shoe and Hi-Lo running count,
 * built the same way Level 4's hook is (independently, not by importing it)
 * so the two levels stay fully decoupled. The only real addition is the
 * checkpoint sub-flow: instead of Level 4's single running-count question,
 * each checkpoint steps the player through running count, a revealed
 * decks-remaining readout (no shoe visual — just told to the player as
 * text, since it isn't reliable enough for them to estimate themselves),
 * and true count before revealing one combined result. The shared engine
 * never needs to know that — as far as it's concerned this is still just a
 * "paused" phase.
 */
export function useTrueCountGame() {
  const shoeRef = useRef<Shoe | null>(null);
  if (shoeRef.current === null) {
    shoeRef.current = createShoe(SHOE_DECK_COUNT);
  }

  // Not displayed to the player — only compared against their checkpoint
  // answers. A ref (not state) because updating it must never itself
  // trigger a render; it changes on every card dealt.
  const runningCountRef = useRef(0);

  // Drives the visual shoe fill — unlike the running count, this *is*
  // rendered (as a proportion, never a number), so it's real state, updated
  // right alongside the real draw so the visual always matches the actual
  // persistent shoe.
  const [cardsRemaining, setCardsRemaining] = useState(TOTAL_SHOE_CARDS);

  // The dealer's hole card is physically dealt (and leaves the shoe) here,
  // face-down — but it isn't exposed to the player yet, so it must not
  // affect the running count until it's actually revealed at settlement
  // (see revealHiddenCard below).
  const drawCard = useCallback((reason?: string) => {
    const card = shoeRef.current!.draw();
    if (reason !== "dealer-hole") {
      runningCountRef.current += hiLoValue(card.rank);
    }
    setCardsRemaining(shoeRef.current!.cardsRemaining());
    return card;
  }, []);

  const revealHiddenCard = useCallback((card: Card) => {
    runningCountRef.current += hiLoValue(card.rank);
  }, []);

  const shouldPauseBeforeNextHand = useCallback(
    (completedHandCount: number) => completedHandCount % CHECKPOINT_INTERVAL === 0,
    [],
  );

  const engine = useBlackjackSession({
    drawCard,
    sessionLength: SESSION_LENGTH,
    shouldPauseBeforeNextHand,
    revealHiddenCard,
  });

  // Checkpoint sub-flow: running count -> decks remaining -> true count,
  // then one combined result. Layered entirely on top of the shared
  // engine's generic "paused" phase; it stays local to this hook.
  const [checkpointStage, setCheckpointStage] = useState<CheckpointStage>("running-count");
  const [runningCountAnswer, setRunningCountAnswer] = useState<number | null>(null);
  // The real, rounded decks-remaining figure — computed and shown to the
  // player right after they submit the running count, never guessed by them.
  const [decksRemainingShown, setDecksRemainingShown] = useState<number | null>(null);

  const [checkpointResults, setCheckpointResults] = useState<TrueCountCheckpointResult[]>([]);
  const [lastCheckpointResult, setLastCheckpointResult] = useState<TrueCountCheckpointResult | null>(null);

  /** Step 1: record the running-count answer, reveal the real decks remaining, and advance. */
  const submitRunningCountAnswer = useCallback(
    (answer: number) => {
      if (!engine.session || engine.session.phase !== "paused") return;
      setRunningCountAnswer(answer);
      setDecksRemainingShown(roundToNearestHalfDeck(shoeRef.current!.decksRemaining()));
      setCheckpointStage("decks-remaining");
    },
    [engine.session],
  );

  /** Step 2: player has seen the decks-remaining readout — advance to the true-count question. */
  const acknowledgeDecksRemaining = useCallback(() => {
    if (!engine.session || engine.session.phase !== "paused") return;
    setCheckpointStage("true-count");
  }, [engine.session]);

  /** Step 3: record the true-count answer, grade it and the running count against the shoe, and show the combined result. */
  const submitTrueCountAnswer = useCallback(
    (answer: number) => {
      if (!engine.session || engine.session.phase !== "paused") return;
      if (runningCountAnswer === null || decksRemainingShown === null) return;

      const actualRunningCount = runningCountRef.current;
      const actualTrueCount = trueCount(actualRunningCount, decksRemainingShown);

      const result: TrueCountCheckpointResult = {
        afterHand: engine.session.completedHandCount,
        runningCount: {
          userAnswer: runningCountAnswer,
          actual: actualRunningCount,
          isCorrect: runningCountAnswer === actualRunningCount,
        },
        trueCount: {
          userAnswer: answer,
          actual: actualTrueCount,
          isCorrect: answer === actualTrueCount,
        },
        decksRemainingShown,
        conversionCorrect: trueCount(runningCountAnswer, decksRemainingShown) === answer,
      };

      setCheckpointResults((prev) => [...prev, result]);
      setLastCheckpointResult(result);
    },
    [engine.session, runningCountAnswer, decksRemainingShown],
  );

  /** Dismiss the checkpoint feedback, reset the sub-flow, and deal the next hand from the same shoe. */
  const continueAfterCheckpoint = useCallback(() => {
    setLastCheckpointResult(null);
    setCheckpointStage("running-count");
    setRunningCountAnswer(null);
    setDecksRemainingShown(null);
    engine.resumeFromPause();
  }, [engine]);

  const strategyAccuracy = (() => {
    const total = engine.session?.decisions.length ?? 0;
    if (total === 0) return null;
    const correct = engine.session!.decisions.filter((d) => d.isCorrect).length;
    return Math.round((correct / total) * 100);
  })();

  const accuracyOf = (selector: (result: TrueCountCheckpointResult) => boolean): number | null => {
    const total = checkpointResults.length;
    if (total === 0) return null;
    const correct = checkpointResults.filter(selector).length;
    return Math.round((correct / total) * 100);
  };

  const runningCountAccuracy = accuracyOf((r) => r.runningCount.isCorrect);
  const trueCountAccuracy = accuracyOf((r) => r.trueCount.isCorrect);

  /** Fresh shoe, fresh count, fresh checkpoints — a new session, not a continuation. */
  const resetSession = useCallback(() => {
    shoeRef.current = createShoe(SHOE_DECK_COUNT);
    runningCountRef.current = 0;
    setCardsRemaining(TOTAL_SHOE_CARDS);
    setCheckpointResults([]);
    setLastCheckpointResult(null);
    setCheckpointStage("running-count");
    setRunningCountAnswer(null);
    setDecksRemainingShown(null);
    engine.startSession();
  }, [engine]);

  return {
    ...engine,
    resetSession,
    checkpointStage,
    checkpointResults,
    lastCheckpointResult,
    decksRemainingShown,
    submitRunningCountAnswer,
    acknowledgeDecksRemaining,
    submitTrueCountAnswer,
    continueAfterCheckpoint,
    strategyAccuracy,
    runningCountAccuracy,
    trueCountAccuracy,
    // Real cardsRemaining/totalCards of the persistent shoe — for visual
    // shoe indicators only. Never a number shown to the player.
    shoeFillFraction: cardsRemaining / TOTAL_SHOE_CARDS,
    cardsRemaining,
    totalCards: TOTAL_SHOE_CARDS,
  };
}
