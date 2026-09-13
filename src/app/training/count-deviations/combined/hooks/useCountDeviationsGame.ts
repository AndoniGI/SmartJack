"use client";

import { useCallback, useRef, useState } from "react";
import { createShoeWithCardCount, type Shoe } from "@/lib/shoe";
import { hiLoValue, roundToNearestHalfDeck, trueCount } from "@/lib/count";
import { type Card } from "@/lib/hand";
import { type FinalAction } from "@/data/basicStrategy";
import { useBlackjackSession } from "@/lib/blackjackSession";
import { getDeviationAwareAction, getInsuranceRecommendation } from "@/lib/deviationStrategy";
import { actionLabel, formatIndexLabel, formatTrueCount } from "../../_shared/deviationFormat";

export const SESSION_LENGTH = 20;
export const CHECKPOINT_INTERVAL = 3;
/** SmartJack's current re-split rule: non-Ace pairs may re-split up to this many total hands. */
export const MAX_SPLIT_HANDS = 4;

const CARDS_PER_DECK = 52;

// Randomized training-start range (see randomStarting* below): deviation
// opportunities are too rare if every session starts at RC 0 with a full
// shoe, so each session instead seeds a synthetic starting point in this
// range. The playable shoe is built to match startingDecksRemaining exactly
// (see buildStartingShoe) rather than a separate fixed-size shoe, so the
// live decks-remaining figure is always a real cardsRemaining/52 quantity.
const STARTING_RC_MIN = -4;
const STARTING_RC_MAX = 8;
const STARTING_DECKS_MIN = 1.5;
const STARTING_DECKS_MAX = 5.5;
const STARTING_DECKS_STEP = 0.5;

// A 20-hand session (with re-splits up to 4 hands) can need well more than
// even the largest randomized starting shoe (5.5 decks = 286 cards) — real
// tables solve this by cutting the shoe and bringing out a fresh one well
// before it's actually empty. drawCard mirrors that: whenever the live shoe
// drops to this many cards or fewer, it's quietly replaced with a fresh,
// freshly-randomized-size shoe before the next card is dealt, so the shoe
// can never actually run dry mid-session. The running count is never reset
// by this — the player was told one starting figure for the whole session
// and keeps accumulating from it regardless of how many shoes are used
// behind the scenes.
const RESHUFFLE_AT_CARDS_REMAINING = 15;

export type CheckpointStage = "running-count" | "decks-remaining" | "true-count";

export interface CheckpointAnswerBreakdown {
  userAnswer: number;
  actual: number;
  isCorrect: boolean;
}

export interface TrueCountCheckpointResult {
  afterHand: number;
  runningCount: CheckpointAnswerBreakdown;
  trueCount: CheckpointAnswerBreakdown;
  decksRemainingShown: number;
}

export interface InsuranceResult {
  tookInsurance: boolean;
  recommended: boolean;
  isCorrect: boolean;
}

function accuracyOf<T>(results: T[], selector: (result: T) => boolean): number | null {
  if (results.length === 0) return null;
  const correct = results.filter(selector).length;
  return Math.round((correct / results.length) * 100);
}

/** A fresh, denser-than-default running-count seed, roughly in [-4, +8]. Never shown to the player. */
function randomStartingRunningCount(): number {
  return Math.floor(Math.random() * (STARTING_RC_MAX - STARTING_RC_MIN + 1)) + STARTING_RC_MIN;
}

/**
 * A fresh decks-remaining seed in [1.5, 5.5], snapped to 0.5-deck steps —
 * this is both the number announced to the player before Hand 1 (or after a
 * reshuffle, silently) and the exact size the playable shoe is built to.
 */
function randomStartingDecksRemaining(): number {
  const deckSteps = Math.round((STARTING_DECKS_MAX - STARTING_DECKS_MIN) / STARTING_DECKS_STEP);
  return STARTING_DECKS_MIN + Math.floor(Math.random() * (deckSteps + 1)) * STARTING_DECKS_STEP;
}

/**
 * Builds the actual playable shoe for a randomized starting decks-remaining
 * figure: ~X × 52 real cards (see the module doc comment) — never a separate
 * "virtual" number layered on top of a fixed-size shoe. Every card drawn
 * from the result decrements its own cardsRemaining by exactly 1.
 */
function buildStartingShoe(startingDecksRemaining: number): Shoe {
  return createShoeWithCardCount(Math.round(startingDecksRemaining * CARDS_PER_DECK));
}

/**
 * Level 6 Combined Mode game hook.
 *
 * Reuses the shared round engine (useBlackjackSession, untouched) with its
 * own persistent shoe and Hi-Lo running count, built independently rather
 * than imported from Level 5's useTrueCountGame — same "levels stay fully
 * decoupled" convention Level 4/5 already follow. The Level 5 checkpoint
 * sub-flow (running count -> reveal decks remaining -> true count ->
 * combined result) is reimplemented here rather than shared, for the same
 * reason.
 *
 * The shoe itself is sized to the session's randomized starting
 * decks-remaining figure (~X × 52 real cards, see buildStartingShoe) rather
 * than a fixed deck count, and reshuffles (a fresh, freshly-randomized-size
 * shoe) whenever it gets low — see RESHUFFLE_AT_CARDS_REMAINING — so the
 * live decks-remaining figure is always a real cardsRemaining/52 quantity,
 * never a separate "virtual" number, and the shoe can never run out mid
 * session.
 *
 * Two things are new relative to Level 5:
 *
 * - Strategy grading is deviation-aware and computed independently of the
 *   shared engine: submitDecision here *wraps* engine.submitDecision rather
 *   than replacing it. The engine still runs its own (plain basic-strategy)
 *   grading internally for its own bookkeeping — this hook simply doesn't
 *   read that; it computes its own correct answer from
 *   getDeviationAwareAction() using the live true count at the moment of
 *   the decision, and returns *that* verdict to the caller (useTableAnimation
 *   only cares about the shape of what submitDecision returns, not where it
 *   came from). The true count itself is never shown during play — only
 *   used to pick the answer key, i.e. deviations are applied "silently."
 * - Insurance is offered via the shared engine's optional onHandDealt hook:
 *   whenever a fresh hand's dealer upcard is an Ace, this hook snapshots the
 *   true count right then and holds the round in a local "pending" gate
 *   until the player answers. The page keeps rendering the real table (both
 *   hands, the dealer's Ace, decks left) throughout and only swaps the
 *   action rail for the Insurance prompt; it also passes this pending state
 *   into useTableAnimation's holdForInsurance option so the dealer-blackjack
 *   peek (and the settle it can trigger) genuinely waits for the player's
 *   answer instead of racing it underneath.
 */
export function useCountDeviationsGame() {
  // The session's starting point (see randomStarting* above) — chosen once
  // per session, reseeded in resetSession. startingRunningCount is the exact
  // figure the pre-session briefing announces to the player (and is never
  // shown again after that); startingDecksRemaining both drives that same
  // briefing and sizes the actual playable shoe below, so the announced
  // figure and the real card supply always agree (see buildStartingShoe).
  const [startingRunningCount, setStartingRunningCount] = useState(randomStartingRunningCount);
  const [startingDecksRemaining, setStartingDecksRemaining] = useState(randomStartingDecksRemaining);

  // runningCountRef is the live ground truth used for grading (checkpoints,
  // Insurance) — seeded from startingRunningCount, then mutated on every
  // card draw. Kept as a ref (not state) since it must never itself trigger
  // a render; only cardsRemaining (below) is state, for the live decks
  // display, which does need to re-render as cards are dealt.
  const runningCountRef = useRef(startingRunningCount);

  const shoeRef = useRef<Shoe | null>(null);
  if (shoeRef.current === null) {
    shoeRef.current = buildStartingShoe(startingDecksRemaining);
  }
  // Equal to shoeRef.current's own cardsRemaining() right after the build
  // above — computed from startingDecksRemaining directly (rather than
  // reading the ref) since ref values shouldn't be read during render.
  const [cardsRemaining, setCardsRemaining] = useState(() => Math.round(startingDecksRemaining * CARDS_PER_DECK));

  const drawCard = useCallback((reason?: string) => {
    // Reshuffle *before* drawing whenever the shoe is nearly out — see
    // RESHUFFLE_AT_CARDS_REMAINING above. This can in principle happen more
    // than once within a single hand (e.g. a heavily re-split round), which
    // is fine: each check only ever tops up a shoe that's actually low.
    if (shoeRef.current!.cardsRemaining() <= RESHUFFLE_AT_CARDS_REMAINING) {
      shoeRef.current = buildStartingShoe(randomStartingDecksRemaining());
    }

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

  /**
   * Live decks-remaining right now, reading the shoe ref directly (not the
   * cardsRemaining state mirror) — needed because this is also called
   * mid-callback from onHandDealt/dealFreshHand, potentially after several
   * synchronous draws in the same call whose cardsRemaining state update
   * hasn't committed yet. A plain cardsRemaining/52 of whatever shoe is
   * currently live — no separate "virtual" bookkeeping. Only ever called
   * outside render (event handlers / other callbacks) — see
   * approxDecksRemaining below for the render-safe equivalent.
   */
  const liveDecksRemaining = useCallback(() => shoeRef.current!.decksRemaining(), []);

  /** Live true count right now, using the exact Level 5 convention: round decks remaining first, then truncate. */
  const liveTrueCount = useCallback(() => {
    const decks = roundToNearestHalfDeck(liveDecksRemaining());
    return trueCount(runningCountRef.current, decks);
  }, [liveDecksRemaining]);

  // --- Insurance lifecycle, keyed off the shared engine's onHandDealt ----
  const [insuranceStage, setInsuranceStage] = useState<"none" | "pending">("none");
  const [insuranceTrueCount, setInsuranceTrueCount] = useState<number | null>(null);
  const [insuranceResults, setInsuranceResults] = useState<InsuranceResult[]>([]);
  const [lastInsuranceResult, setLastInsuranceResult] = useState<InsuranceResult | null>(null);

  const onHandDealt = useCallback(
    (dealerUpcard: Card) => {
      setLastInsuranceResult(null);
      if (dealerUpcard.rank === "A") {
        setInsuranceTrueCount(liveTrueCount());
        setInsuranceStage("pending");
      } else {
        setInsuranceTrueCount(null);
        setInsuranceStage("none");
      }
    },
    [liveTrueCount],
  );

  const engine = useBlackjackSession({
    drawCard,
    sessionLength: SESSION_LENGTH,
    shouldPauseBeforeNextHand,
    revealHiddenCard,
    onHandDealt,
    maxSplitHands: MAX_SPLIT_HANDS,
  });

  /** Grade the insurance decision; the round stays gated (see insuranceStage) until continueAfterInsurance. */
  const submitInsuranceAnswer = useCallback(
    (tookInsurance: boolean) => {
      if (insuranceTrueCount === null) return;
      const recommended = getInsuranceRecommendation(insuranceTrueCount);
      const result: InsuranceResult = { tookInsurance, recommended, isCorrect: tookInsurance === recommended };
      setInsuranceResults((prev) => [...prev, result]);
      setLastInsuranceResult(result);
    },
    [insuranceTrueCount],
  );

  /** Dismiss the insurance feedback and reveal the table — already resolved underneath (peek, or the normal decision). */
  const continueAfterInsurance = useCallback(() => {
    setLastInsuranceResult(null);
    setInsuranceStage("none");
  }, []);

  // --- Deviation-aware strategy grading, wrapping (not replacing) the ---
  // --- shared engine's own submitDecision.                             ---
  const [strategyResults, setStrategyResults] = useState<{ isCorrect: boolean; deviationApplied: boolean }[]>([]);

  const submitDecision = useCallback(
    (action: FinalAction) => {
      if (!engine.session) return null;
      const hand = engine.session.hands[engine.session.currentHandIndex];
      if (!hand) return null;

      const tc = liveTrueCount();
      const splitContext = { totalHandsInRound: engine.session.hands.length, maxHands: MAX_SPLIT_HANDS };
      const decision = getDeviationAwareAction(hand, engine.session.dealerUpcard.rank, tc, splitContext);
      const isCorrect = action === decision.finalAction;

      engine.submitDecision(action);
      setStrategyResults((prev) => [...prev, { isCorrect, deviationApplied: decision.deviationApplied }]);

      // Compact toast breakdown, only when wrong and a deviation actually
      // changed the answer — a plain miss (no deviation) falls back to
      // useTableAnimation's generic "Correct play: X" line, per spec.
      const detailLines =
        !isCorrect && decision.deviationApplied && decision.rule
          ? [
              `Basic strategy: ${actionLabel(decision.basicAction)}`,
              `Current TC: ${formatTrueCount(tc)}`,
              `Deviation: ${formatIndexLabel(decision.rule)}`,
              `Correct play: ${actionLabel(decision.finalAction)}`,
            ]
          : undefined;

      return { isCorrect, correctAction: decision.finalAction, detailLines };
    },
    [engine, liveTrueCount],
  );

  // --- Checkpoint sub-flow: running count -> reveal decks remaining -> -
  // --- true count -> combined result. Same shape as Level 5's, kept    -
  // --- local rather than imported (see file doc comment).              -
  const [checkpointStage, setCheckpointStage] = useState<CheckpointStage>("running-count");
  const [runningCountAnswer, setRunningCountAnswer] = useState<number | null>(null);
  const [decksRemainingShown, setDecksRemainingShown] = useState<number | null>(null);
  const [checkpointResults, setCheckpointResults] = useState<TrueCountCheckpointResult[]>([]);
  const [lastCheckpointResult, setLastCheckpointResult] = useState<TrueCountCheckpointResult | null>(null);

  const submitRunningCountAnswer = useCallback(
    (answer: number) => {
      if (!engine.session || engine.session.phase !== "paused") return;
      setRunningCountAnswer(answer);
      setDecksRemainingShown(roundToNearestHalfDeck(liveDecksRemaining()));
      setCheckpointStage("decks-remaining");
    },
    [engine.session, liveDecksRemaining],
  );

  const acknowledgeDecksRemaining = useCallback(() => {
    if (!engine.session || engine.session.phase !== "paused") return;
    setCheckpointStage("true-count");
  }, [engine.session]);

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
      };

      setCheckpointResults((prev) => [...prev, result]);
      setLastCheckpointResult(result);
    },
    [engine.session, runningCountAnswer, decksRemainingShown],
  );

  const continueAfterCheckpoint = useCallback(() => {
    setLastCheckpointResult(null);
    setCheckpointStage("running-count");
    setRunningCountAnswer(null);
    setDecksRemainingShown(null);
    engine.resumeFromPause();
  }, [engine]);

  // Continuously-visible approximate decks remaining — the same convention
  // as Level 5's checkpoint readout (roundToNearestHalfDeck), but shown live
  // during play instead of only at a checkpoint. A direct function of the
  // real shoe's cardsRemaining (state, so this recomputes on every draw) —
  // never the running count or true count themselves: the player must still
  // track those mentally and combine them with this figure.
  const approxDecksRemaining = roundToNearestHalfDeck(cardsRemaining / CARDS_PER_DECK);

  const strategyAccuracy = accuracyOf(strategyResults, (r) => r.isCorrect);
  const runningCountAccuracy = accuracyOf(checkpointResults, (r) => r.runningCount.isCorrect);
  const trueCountAccuracy = accuracyOf(checkpointResults, (r) => r.trueCount.isCorrect);
  const insuranceAccuracy = accuracyOf(insuranceResults, (r) => r.isCorrect);

  // Optional secondary stat: of the decisions where a deviation actually
  // changed the answer, how many did the player get right.
  const deviationDecisions = strategyResults.filter((r) => r.deviationApplied);
  const deviationDecisionsCorrect = deviationDecisions.filter((r) => r.isCorrect).length;
  const deviationDecisionsTotal = deviationDecisions.length;

  const resetSession = useCallback(() => {
    const newStartingRunningCount = randomStartingRunningCount();
    const newStartingDecksRemaining = randomStartingDecksRemaining();
    runningCountRef.current = newStartingRunningCount;
    setStartingRunningCount(newStartingRunningCount);
    setStartingDecksRemaining(newStartingDecksRemaining);
    shoeRef.current = buildStartingShoe(newStartingDecksRemaining);
    setCardsRemaining(shoeRef.current.cardsRemaining());
    setCheckpointResults([]);
    setLastCheckpointResult(null);
    setCheckpointStage("running-count");
    setRunningCountAnswer(null);
    setDecksRemainingShown(null);
    setStrategyResults([]);
    setInsuranceResults([]);
    setLastInsuranceResult(null);
    setInsuranceStage("none");
    setInsuranceTrueCount(null);
    engine.startSession();
  }, [engine]);

  return {
    ...engine,
    submitDecision,
    resetSession,
    startingRunningCount,
    startingDecksRemaining,
    checkpointStage,
    lastCheckpointResult,
    decksRemainingShown,
    approxDecksRemaining,
    submitRunningCountAnswer,
    acknowledgeDecksRemaining,
    submitTrueCountAnswer,
    continueAfterCheckpoint,
    insuranceStage,
    lastInsuranceResult,
    submitInsuranceAnswer,
    continueAfterInsurance,
    strategyAccuracy,
    runningCountAccuracy,
    trueCountAccuracy,
    insuranceAccuracy,
    deviationDecisionsCorrect,
    deviationDecisionsTotal,
    cardsRemaining,
  };
}
