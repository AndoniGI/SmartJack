"use client";

import { useState, useCallback } from "react";
import { type Card, type Hand } from "@/lib/hand";
import { type FinalAction } from "@/data/basicStrategy";
import { getCorrectAction, isActionLegal } from "@/lib/strategy";
import { shouldDealerHit, getDealerTotal, getHandOutcome } from "@/lib/dealer";
import { calculateHardTotal, isBust, getBestTotal, isNaturalBlackjack } from "@/lib/hand";

/**
 * Decision tracking for scoring.
 */
export interface Decision {
  handIndex: number;
  correctAction: FinalAction;
  userAction: FinalAction | null;
  isCorrect: boolean | null;
  feedback: string | null;
}

/**
 * Hand result after play.
 */
export interface HandResult {
  playerCards: Card[];
  playerTotal: number;
  playerBust: boolean;
  wasDoubled: boolean;
  dealerCards: Card[];
  dealerTotal: number;
  dealerBust: boolean;
  outcome: "win" | "loss" | "push";
}

/**
 * Session state.
 *
 * "paused" is a hold point between hands (e.g. a counting checkpoint) that a
 * caller can opt into via `shouldPauseBeforeNextHand`; callers that never
 * pass that option never see this phase.
 */
export interface GameSessionState {
  phase: "playing" | "hand-complete" | "paused" | "results";
  hands: Hand[];
  dealerHoleCard: Card; // dealt face-down alongside the upcard, revealed only at settlement
  dealerUpcard: Card;
  currentHandIndex: number;
  currentDecision: Decision | null;
  currentHandOutcome: HandResult[] | null; // Outcome(s) after hand(s) settle
  decisions: Decision[];
  handResults: HandResult[];
  sessionScore: number;
  completedHandCount: number; // Number of hands completed (for the session-length limit)
}

export interface UseBlackjackSessionOptions {
  /**
   * Draws the next card from whatever source the caller wants (infinite
   * random deck, a persistent shoe, ...). `reason` identifies why the card
   * is being drawn (e.g. "dealer-hole") for callers that need to treat some
   * draws differently — a card counter, for instance, must not count the
   * dealer's hole card until it's revealed (see `revealHiddenCard`).
   */
  drawCard: (reason?: string) => Card;
  /** Total hands in a session before the "results" phase. */
  sessionLength: number;
  /**
   * Called with the just-completed hand count before dealing the next hand.
   * Returning true holds the session in a "paused" phase instead of dealing
   * — the caller resumes it later via `resumeFromPause`. Optional; omitted
   * entirely, hands deal back-to-back with no pause.
   */
  shouldPauseBeforeNextHand?: (completedHandCount: number) => boolean;
  /**
   * Called exactly once, at settlement, with the dealer's hole card — the
   * moment it actually becomes visible to the player. Lets a caller that
   * counts cards (e.g. a Hi-Lo running count) attribute the hole card's
   * value to the instant it's revealed rather than when it was dealt
   * face-down. Optional; omitted entirely by callers that don't count cards.
   */
  revealHiddenCard?: (card: Card) => void;
}

/**
 * Shared blackjack round engine (opening deal, hit/stand/double/split,
 * dealer S17 play, outcome settlement, strategy scoring). Extracted from
 * Level 3's basic-strategy game so it can be reused with a different card
 * source (e.g. a persistent shoe) and a different session length without
 * duplicating the rules.
 */
export function useBlackjackSession({
  drawCard,
  sessionLength,
  shouldPauseBeforeNextHand,
  revealHiddenCard,
}: UseBlackjackSessionOptions) {
  const [session, setSession] = useState<GameSessionState | null>(null);

  /**
   * Merge a patch into the current session.
   *
   * The patch must already be fully computed — never call `drawCard` (or
   * anything else with side effects) from inside the updater passed here.
   * React Strict Mode invokes a `setState` updater function twice in dev to
   * surface exactly this kind of impurity; a `drawCard` call inside one
   * would draw (and count) an extra, never-displayed card every time.
   */
  const mergeSession = useCallback((patch: Partial<GameSessionState>) => {
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  /**
   * Create a decision object for a hand.
   * Returns null if hand is a natural blackjack (no decision needed).
   */
  const createDecision = useCallback(
    (hand: Hand, dealerUpcard: Card): Decision | null => {
      // Natural blackjacks don't get decisions
      if (isNaturalBlackjack(hand.cards)) {
        return null;
      }

      try {
        const correctAction = getCorrectAction(hand, dealerUpcard.rank);
        return {
          handIndex: -1,
          correctAction,
          userAction: null,
          isCorrect: null,
          feedback: null,
        };
      } catch (e) {
        throw new Error(`Failed to create decision: ${e}`);
      }
    },
    [],
  );

  /**
   * Deal a fresh two-card hand for both player and dealer.
   * Standard U.S. peek: with an Ace or 10-value upcard, the dealer's
   * natural is checked before the player gets any decision at all.
   */
  const dealFreshHand = useCallback((): Pick<
    GameSessionState,
    "phase" | "hands" | "dealerUpcard" | "dealerHoleCard" | "currentHandIndex" | "currentDecision" | "currentHandOutcome"
  > => {
    const dealerUp = drawCard("dealer-upcard");
    const dealerHoleCard = drawCard("dealer-hole");
    const playerCards = [drawCard("player-initial"), drawCard("player-initial")];

    const dealerHasBlackjack = isNaturalBlackjack([dealerUp, dealerHoleCard]);

    const initialHand: Hand = {
      cards: playerCards,
      status: dealerHasBlackjack || isNaturalBlackjack(playerCards) ? "settled" : "playing",
      hasSplit: false,
      hasActed: false,
      hasDoubled: false,
    };

    const decision = dealerHasBlackjack ? null : createDecision(initialHand, dealerUp);

    return {
      phase: "playing",
      hands: [initialHand],
      dealerUpcard: dealerUp,
      dealerHoleCard,
      currentHandIndex: 0,
      currentDecision: decision,
      currentHandOutcome: null,
    };
  }, [drawCard, createDecision]);

  /**
   * Apply a player action to the game state.
   */
  const applyAction = useCallback(
    (gameSession: GameSessionState, action: FinalAction): GameSessionState => {
      const hand = gameSession.hands[gameSession.currentHandIndex];
      if (!hand) throw new Error("Invalid hand index");

      const updatedSession = { ...gameSession };
      const updatedHand = { ...hand, hasActed: true };

      switch (action) {
        case "hit": {
          const newCard = drawCard("hit");
          updatedHand.cards = [...hand.cards, newCard];
          if (isBust(updatedHand.cards)) {
            updatedHand.status = "settled";
          }
          updatedSession.hands[gameSession.currentHandIndex] = updatedHand;
          break;
        }

        case "stand": {
          updatedHand.status = "settled";
          updatedSession.hands[gameSession.currentHandIndex] = updatedHand;
          break;
        }

        case "double": {
          const newCard = drawCard("double");
          updatedHand.cards = [...hand.cards, newCard];
          updatedHand.status = "settled";
          updatedHand.hasDoubled = true;
          updatedSession.hands[gameSession.currentHandIndex] = updatedHand;
          break;
        }

        case "split": {
          const card1 = hand.cards[0];
          const card2 = hand.cards[1];
          const newCard1 = drawCard("split");
          const newCard2 = drawCard("split");

          const hand1: Hand = {
            cards: [card1, newCard1],
            status: isNaturalBlackjack([card1, newCard1]) ? "settled" : "playing",
            hasSplit: true,
            hasActed: false,
            hasDoubled: false,
          };

          const hand2: Hand = {
            cards: [card2, newCard2],
            status: isNaturalBlackjack([card2, newCard2]) ? "settled" : "playing",
            hasSplit: true,
            hasActed: false,
            hasDoubled: false,
          };

          updatedSession.hands[gameSession.currentHandIndex] = hand1;
          updatedSession.hands.push(hand2);
          break;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return updatedSession;
    },
    [drawCard],
  );

  /**
   * Start a new session.
   */
  const startSession = useCallback(() => {
    const fresh = dealFreshHand();
    const newSession: GameSessionState = {
      ...fresh,
      decisions: [],
      handResults: [],
      sessionScore: 0,
      completedHandCount: 0,
    };
    setSession(newSession);
  }, [dealFreshHand]);

  /**
   * Submit a decision and record feedback.
   * After submission, automatically advances to next decision or hand.
   */
  const submitDecision = useCallback(
    (action: FinalAction) => {
      if (!session) throw new Error("No active session");
      if (session.phase !== "playing") throw new Error("Game not in playing phase");
      if (!session.currentDecision) throw new Error("No current decision");

      const hand = session.hands[session.currentHandIndex];
      if (!hand) throw new Error("Invalid hand index");

      if (!isActionLegal(hand, action)) {
        throw new Error(`Action ${action} is not legal for this hand`);
      }

      const isCorrect = action === session.currentDecision.correctAction;
      const feedback = isCorrect
        ? "Correct!"
        : `Incorrect. The correct play was: ${session.currentDecision.correctAction}`;

      const updatedDecision: Decision = {
        ...session.currentDecision,
        handIndex: session.currentHandIndex,
        userAction: action,
        isCorrect,
        feedback,
      };

      const updatedSession = applyAction(session, action);

      setSession((prev) => {
        if (!prev) return prev;

        const newSession = {
          ...updatedSession,
          currentDecision: null,
          decisions: [...prev.decisions, updatedDecision],
          sessionScore: prev.sessionScore + (isCorrect ? 1 : 0),
        };

        return newSession;
      });

      return updatedDecision;
    },
    [session, applyAction],
  );

  /**
   * Settle every hand in the round against a single dealer play.
   * Called once all hands (including any split hands) are settled.
   */
  const settleAllHands = useCallback(
    (hands: Hand[], dealerUpcard: Card, dealerHoleCard: Card): HandResult[] => {
      // The hole card was dealt face-down; this is the moment it's actually
      // shown to the player, so a card counter should attribute its value
      // here, not back when it was drawn.
      revealHiddenCard?.(dealerHoleCard);

      const dealerCards = [dealerUpcard, dealerHoleCard];
      const dealerHasBlackjack = isNaturalBlackjack(dealerCards);
      const everyHandAlreadyResolved = hands.every(
        (hand) => isBust(hand.cards) || isNaturalBlackjack(hand.cards),
      );

      if (!everyHandAlreadyResolved) {
        while (shouldDealerHit(dealerCards)) {
          dealerCards.push(drawCard("dealer-draw"));
        }
      }

      const dealerFinal = getDealerTotal(dealerCards);
      const dealerBustFlag = calculateHardTotal(dealerCards) > 21;

      return hands.map((hand) => {
        const playerTotal = getBestTotal(hand.cards);
        const playerBustFlag = isBust(hand.cards);
        const playerHasBlackjack = isNaturalBlackjack(hand.cards);
        const outcome = getHandOutcome(
          playerTotal,
          playerBustFlag,
          dealerFinal,
          dealerBustFlag,
          playerHasBlackjack,
          dealerHasBlackjack,
        );

        return {
          playerCards: hand.cards,
          playerTotal,
          playerBust: playerBustFlag,
          wasDoubled: hand.hasDoubled,
          dealerCards,
          dealerTotal: dealerFinal,
          dealerBust: dealerBustFlag,
          outcome,
        };
      });
    },
    [drawCard, revealHiddenCard],
  );

  /**
   * Continue to next decision or hand.
   * - If still playing current hand (after Hit), create new decision
   * - If hand settled, show outcome screen
   * - If all hands done: deal the next hand, pause (if requested), or show results
   */
  const continueToNextHand = useCallback(() => {
    if (!session) throw new Error("No active session");

    // Phase: hand-complete (showing outcome)
    // Move to next hand, pause for a checkpoint, or finish session.
    // A checkpoint takes priority over ending the session — e.g. with a
    // checkpoint every 3 hands in a 12-hand session, the last checkpoint
    // (after hand 12) must still show before the results screen, so
    // `shouldPauseBeforeNextHand` is checked before the length limit.
    if (session.phase === "hand-complete") {
      const completedCount = session.completedHandCount + 1;

      if (shouldPauseBeforeNextHand?.(completedCount)) {
        mergeSession({
          phase: "paused",
          completedHandCount: completedCount,
          currentDecision: null,
          currentHandOutcome: null,
        });
        return;
      }

      if (completedCount >= sessionLength) {
        mergeSession({
          phase: "results",
          completedHandCount: completedCount,
          currentDecision: null,
          currentHandOutcome: null,
        });
        return;
      }

      // Dealt once here, outside the state update (see mergeSession).
      const fresh = dealFreshHand();
      mergeSession({ ...fresh, completedHandCount: completedCount });
      return;
    }

    // Phase: playing (user making decisions)
    const currentHand = session.hands[session.currentHandIndex];
    if (!currentHand) throw new Error("Invalid hand index");

    // Still playing? Create new decision (e.g., after Hit)
    if (currentHand.status === "playing") {
      const newDecision = createDecision(currentHand, session.dealerUpcard);
      mergeSession({ currentDecision: newDecision });
      return;
    }

    // Hand is settled; move to next hand in current game or show outcome
    const nextHandIndex = session.currentHandIndex + 1;

    if (nextHandIndex < session.hands.length) {
      // More split hands to play
      const nextHand = session.hands[nextHandIndex];
      const newDecision = createDecision(nextHand, session.dealerUpcard);
      mergeSession({ currentHandIndex: nextHandIndex, currentDecision: newDecision });
      return;
    }

    // All hands in this round (including any split hands) are settled;
    // play the dealer once and settle every hand against that result.
    // Called directly, outside the state update (see mergeSession) — this
    // draws additional dealer cards and reveals the hole card, both of
    // which must happen exactly once.
    const results = settleAllHands(session.hands, session.dealerUpcard, session.dealerHoleCard);
    mergeSession({
      phase: "hand-complete",
      currentHandOutcome: results,
      handResults: [...session.handResults, ...results],
      currentDecision: null,
    });
  }, [session, mergeSession, createDecision, settleAllHands, sessionLength, shouldPauseBeforeNextHand, dealFreshHand]);

  /**
   * Resume from a "paused" phase (e.g. after a counting checkpoint) by
   * dealing the next hand, or finishing the session if the checkpoint was
   * the one after the final hand. No-op if the session isn't paused.
   */
  const resumeFromPause = useCallback(() => {
    if (!session || session.phase !== "paused") return;

    if (session.completedHandCount >= sessionLength) {
      mergeSession({ phase: "results" });
      return;
    }

    // Dealt once here, outside the state update (see mergeSession).
    const fresh = dealFreshHand();
    mergeSession(fresh);
  }, [session, mergeSession, dealFreshHand, sessionLength]);

  /**
   * Reset and start new session.
   */
  const resetSession = useCallback(() => {
    startSession();
  }, [startSession]);

  return {
    session,
    startSession,
    submitDecision,
    continueToNextHand,
    resumeFromPause,
    resetSession,
  };
}
