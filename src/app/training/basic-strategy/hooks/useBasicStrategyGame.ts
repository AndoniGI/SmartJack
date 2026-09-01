"use client";

import { useState, useCallback } from "react";
import { type Card, type Hand } from "@/lib/hand";
import { type FinalAction } from "@/data/basicStrategy";
import { getCorrectAction, isActionLegal } from "@/lib/strategy";
import { shouldDealerHit, getDealerTotal, getHandOutcome } from "@/lib/dealer";
import { calculateHardTotal, isBust, getBestTotal, isNaturalBlackjack } from "@/lib/hand";

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const suits = ["♠", "♥", "♦", "♣"] as const;

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
 */
export interface GameSessionState {
  phase: "playing" | "hand-complete" | "results"; // playing -> user makes decisions, hand-complete -> show outcome, results -> 10 hands done
  hands: Hand[];
  dealerHoleCard: Card; // dealt face-down alongside the upcard, revealed only at settlement
  dealerUpcard: Card;
  currentHandIndex: number;
  currentDecision: Decision | null;
  currentHandOutcome: HandResult[] | null; // Outcome(s) after hand(s) settle
  decisions: Decision[];
  handResults: HandResult[];
  sessionScore: number;
  completedHandCount: number; // Number of hands completed (for 10-hand limit)
}

/**
 * Hook for managing Level 3 basic-strategy game.
 */
export function useBasicStrategyGame() {
  const [session, setSession] = useState<GameSessionState | null>(null);

  /**
   * Generate a random card.
   */
  const generateCard = useCallback((): Card => {
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    return {
      id: `${rank}-${suit}-${Date.now()}-${Math.random()}`,
      rank,
      suit,
    };
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
          const newCard = generateCard();
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
          const newCard = generateCard();
          updatedHand.cards = [...hand.cards, newCard];
          updatedHand.status = "settled";
          updatedHand.hasDoubled = true;
          updatedSession.hands[gameSession.currentHandIndex] = updatedHand;
          break;
        }

        case "split": {
          const card1 = hand.cards[0];
          const card2 = hand.cards[1];
          const newCard1 = generateCard();
          const newCard2 = generateCard();

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
    [generateCard],
  );

  /**
   * Start a new session.
   */
  const startSession = useCallback(() => {
    const dealerUp = generateCard();
    const dealerHoleCard = generateCard();
    const playerCards = [generateCard(), generateCard()];

    // Standard U.S. peek: with an Ace or 10-value upcard, the dealer's
    // natural is checked before the player gets any decision at all.
    const dealerHasBlackjack = isNaturalBlackjack([dealerUp, dealerHoleCard]);

    const initialHand: Hand = {
      cards: playerCards,
      status: dealerHasBlackjack || isNaturalBlackjack(playerCards) ? "settled" : "playing",
      hasSplit: false,
      hasActed: false,
      hasDoubled: false,
    };

    const decision = dealerHasBlackjack ? null : createDecision(initialHand, dealerUp);

    const newSession: GameSessionState = {
      phase: "playing",
      hands: [initialHand],
      dealerUpcard: dealerUp,
      dealerHoleCard,
      currentHandIndex: 0,
      currentDecision: decision,
      currentHandOutcome: null,
      decisions: [],
      handResults: [],
      sessionScore: 0,
      completedHandCount: 0,
    };

    setSession(newSession);
  }, [generateCard, createDecision]);

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
   *
   * The dealer's upcard and hole card were already dealt at the start of
   * the hand (so the UI can deal them face-down and flip them later); this
   * only draws further cards via the existing S17 shouldDealerHit loop.
   *
   * If every hand is already resolved independently of the dealer's total
   * (all busted, or a natural blackjack that never draws further per
   * standard rules), further dealer cards can't change any outcome —
   * getHandOutcome already returns "loss" unconditionally for a busted
   * hand, and a natural only ever compares against the dealer's first two
   * cards — so drawing is skipped. This changes nothing about what any
   * hand's result is, only whether the dealer draws cards nobody needed.
   */
  const settleAllHands = useCallback(
    (hands: Hand[], dealerUpcard: Card, dealerHoleCard: Card): HandResult[] => {
      const dealerCards = [dealerUpcard, dealerHoleCard];
      // Must be read from the original two-card pair, before any further
      // cards are (conditionally) pushed onto dealerCards below.
      const dealerHasBlackjack = isNaturalBlackjack(dealerCards);
      const everyHandAlreadyResolved = hands.every(
        (hand) => isBust(hand.cards) || isNaturalBlackjack(hand.cards),
      );

      if (!everyHandAlreadyResolved) {
        while (shouldDealerHit(dealerCards)) {
          dealerCards.push(generateCard());
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
    [generateCard],
  );

  /**
   * Continue to next decision or hand.
   * - If still playing current hand (after Hit), create new decision
   * - If hand settled, show outcome screen
   * - If all hands done, check completed count; if 10+ hands, show results; else start new session
   */
  const continueToNextHand = useCallback(() => {
    setSession((prevSession) => {
      if (!prevSession) throw new Error("No active session");

      // Phase: hand-complete (showing outcome)
      // Move to next hand or finish session
      if (prevSession.phase === "hand-complete") {
        const completedCount = prevSession.completedHandCount + 1;

        // 10 hands done? Show full results
        if (completedCount >= 10) {
          return {
            ...prevSession,
            phase: "results",
            completedHandCount: completedCount,
            currentDecision: null,
            currentHandOutcome: null,
          };
        }

        // Start a new hand
        const dealerUp = generateCard();
        const dealerHoleCard = generateCard();
        const playerCards = [generateCard(), generateCard()];

        // Standard U.S. peek: with an Ace or 10-value upcard, the dealer's
        // natural is checked before the player gets any decision at all.
        const dealerHasBlackjack = isNaturalBlackjack([dealerUp, dealerHoleCard]);

        const newHand: Hand = {
          cards: playerCards,
          status: dealerHasBlackjack || isNaturalBlackjack(playerCards) ? "settled" : "playing",
          hasSplit: false,
          hasActed: false,
          hasDoubled: false,
        };

        const newDecision = dealerHasBlackjack ? null : createDecision(newHand, dealerUp);

        return {
          ...prevSession,
          phase: "playing",
          hands: [newHand],
          dealerUpcard: dealerUp,
          dealerHoleCard,
          currentHandIndex: 0,
          currentDecision: newDecision,
          currentHandOutcome: null,
          completedHandCount: completedCount,
        };
      }

      // Phase: playing (user making decisions)
      const currentHand = prevSession.hands[prevSession.currentHandIndex];
      if (!currentHand) throw new Error("Invalid hand index");

      // Still playing? Create new decision (e.g., after Hit)
      if (currentHand.status === "playing") {
        const newDecision = createDecision(currentHand, prevSession.dealerUpcard);
        return {
          ...prevSession,
          currentDecision: newDecision,
        };
      }

      // Hand is settled; move to next hand in current game or show outcome
      const nextHandIndex = prevSession.currentHandIndex + 1;

      if (nextHandIndex < prevSession.hands.length) {
        // More split hands to play
        const nextHand = prevSession.hands[nextHandIndex];
        const newDecision = createDecision(nextHand, prevSession.dealerUpcard);

        return {
          ...prevSession,
          currentHandIndex: nextHandIndex,
          currentDecision: newDecision,
        };
      }

      // All hands in this round (including any split hands) are settled;
      // play the dealer once and settle every hand against that result.
      const results = settleAllHands(prevSession.hands, prevSession.dealerUpcard, prevSession.dealerHoleCard);

      return {
        ...prevSession,
        phase: "hand-complete",
        currentHandOutcome: results,
        handResults: [...prevSession.handResults, ...results],
        currentDecision: null,
      };
    });
  }, [generateCard, createDecision, settleAllHands]);

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
    resetSession,
  };
}
