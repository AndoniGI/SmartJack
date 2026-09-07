"use client";

import { useCallback, useRef, useState } from "react";
import { createShoe, type Shoe } from "@/lib/shoe";
import { hiLoValue } from "@/lib/count";
import { type Card } from "@/lib/hand";
import { useBlackjackSession } from "@/lib/blackjackSession";

export const SHOE_DECK_COUNT = 6;
export const SESSION_LENGTH = 12;
export const CHECKPOINT_INTERVAL = 3;

const CARDS_PER_DECK = 52;
const TOTAL_SHOE_CARDS = SHOE_DECK_COUNT * CARDS_PER_DECK;

export interface CountCheckpointResult {
  afterHand: number; // completedHandCount at the time of this checkpoint
  userAnswer: number;
  actualRunningCount: number;
  isCorrect: boolean;
}

/**
 * Level 4 (Live Counting) game hook.
 *
 * Wraps the shared round engine (useBlackjackSession — same one Level 3
 * uses) with a persistent 6-deck shoe as the card source, a Hi-Lo running
 * count kept internally (never displayed), and running-count checkpoints
 * every 3 completed hands. Gameplay rules (hit/stand/double/split, dealer
 * S17, outcomes, strategy scoring) are entirely the shared engine's — this
 * hook only adds the shoe, the count, and the checkpoint bookkeeping.
 */
export function useLiveCountGame() {
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

  const [checkpointResults, setCheckpointResults] = useState<CountCheckpointResult[]>([]);
  const [lastCheckpointResult, setLastCheckpointResult] = useState<CountCheckpointResult | null>(null);

  /** Submit an answer for the checkpoint currently showing; records it but does not deal the next hand yet. */
  const submitCountAnswer = useCallback(
    (answer: number) => {
      if (!engine.session || engine.session.phase !== "paused") return;

      const actual = runningCountRef.current;
      const result: CountCheckpointResult = {
        afterHand: engine.session.completedHandCount,
        userAnswer: answer,
        actualRunningCount: actual,
        isCorrect: answer === actual,
      };

      setCheckpointResults((prev) => [...prev, result]);
      setLastCheckpointResult(result);
    },
    [engine.session],
  );

  /** Dismiss the checkpoint feedback and deal the next hand from the same shoe. */
  const continueAfterCheckpoint = useCallback(() => {
    setLastCheckpointResult(null);
    engine.resumeFromPause();
  }, [engine]);

  const strategyAccuracy = (() => {
    const total = engine.session?.decisions.length ?? 0;
    if (total === 0) return null;
    const correct = engine.session!.decisions.filter((d) => d.isCorrect).length;
    return Math.round((correct / total) * 100);
  })();

  const countAccuracy = (() => {
    const total = checkpointResults.length;
    if (total === 0) return null;
    const correct = checkpointResults.filter((r) => r.isCorrect).length;
    return Math.round((correct / total) * 100);
  })();

  /** Fresh shoe, fresh count, fresh checkpoints — a new session, not a continuation. */
  const resetSession = useCallback(() => {
    shoeRef.current = createShoe(SHOE_DECK_COUNT);
    runningCountRef.current = 0;
    setCardsRemaining(TOTAL_SHOE_CARDS);
    setCheckpointResults([]);
    setLastCheckpointResult(null);
    engine.startSession();
  }, [engine]);

  return {
    ...engine,
    resetSession,
    checkpointResults,
    lastCheckpointResult,
    submitCountAnswer,
    continueAfterCheckpoint,
    strategyAccuracy,
    countAccuracy,
    // Real cardsRemaining/totalCards ratio of the persistent shoe — for a
    // visual fill indicator only. Never a number shown to the player, and
    // deliberately not decks-remaining (that's Level 5).
    shoeFillFraction: cardsRemaining / TOTAL_SHOE_CARDS,
  };
}
