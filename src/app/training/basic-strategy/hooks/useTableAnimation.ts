"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Card, isBust, isNaturalBlackjack, rankToValue } from "@/lib/hand";
import { type FinalAction } from "@/data/basicStrategy";
import { type GameSessionState } from "./useBasicStrategyGame";

/**
 * Table animation / pacing engine for the Level 3 gameplay screen.
 *
 * This hook owns 100% of the timing and sequencing state for the table —
 * the opening deal, bust/double pauses, dealer reveal pacing, and the
 * strategy-decision toasts. It never computes a card, a total, a legal
 * action, or an outcome; it only decides *when* to surface what
 * useBasicStrategyGame has already produced, by reacting to `session`
 * changes and calling the two functions that hook already exposes
 * (submitDecision / continueToNextHand) at the right moment. Game rules
 * live entirely in useBasicStrategyGame; this file only knows about time.
 *
 * Every duration below is a single named constant so a future Slow /
 * Normal / Fast practice-speed selector can retune the whole table by
 * changing values here, in one place.
 */

// Opening deal: player1, dealer-up, player2, dealer-hole (face-down)
export const DEAL_CARD_TRAVEL_MS = 350; // 300-400ms card travel from the shoe
export const DEAL_PAUSE_BETWEEN_CARDS_MS = 450; // 400-500ms pause between each opening card

// In-hand card animation (Hit / Double / split's new cards)
export const CARD_DEAL_ANIMATION_MS = 320; // 300-350ms

// Natural blackjack: beat to register "Blackjack!" before settling
export const NATURAL_BLACKJACK_PAUSE_MS = 600;

// Double: pause after the doubled card lands, before the dealer plays
export const POST_DOUBLE_PAUSE_MS = 850; // 700-1000ms

// Bust: brief pause showing "Bust" before continuing
export const BUST_MESSAGE_PAUSE_MS = 900;

// Split: the original two-card hand sliding apart into two single-card hands
export const SPLIT_APART_DURATION_MS = 420; // 400-500ms, matches the deal pacing

// Dealer reveal (after all player hands in the round are settled)
export const DEALER_CARD_REVEAL_INTERVAL_MS = 1100; // 1000-1200ms between dealer cards
export const OUTCOME_REVEAL_DELAY_MS = 800; // 700-900ms pause after the dealer finishes

// Dealer blackjack check (upcard is Ace/10-value only): the cards tilt as
// if being peeked at, a "Checking..." message shows, then a brief result
// message before either the reveal (blackjack) or normal play (no blackjack).
export const DEALER_CHECK_TILT_MS = 300; // 250-350ms tilt/shift transition
export const DEALER_CHECK_PAUSE_MS = 850; // 700-1000ms "checking" pause
export const DEALER_CHECK_RESULT_MS = 800; // brief result message before continuing

// Strategy-decision toast
export const TOAST_DURATION_MS = 2200; // 2-2.5s

export interface Toast {
  id: string;
  message: string;
  isCorrect: boolean;
}

interface UseTableAnimationArgs {
  session: GameSessionState | null;
  submitDecision: (action: FinalAction) => { isCorrect: boolean | null; correctAction: FinalAction } | null;
  continueToNextHand: () => void;
}

function capitalizeAction(action: FinalAction): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export function useTableAnimation({ session, submitDecision, continueToNextHand }: UseTableAnimationArgs) {
  const [isDealing, setIsDealing] = useState(true);
  const [dealtCount, setDealtCount] = useState(0);
  const [animatingCardIds, setAnimatingCardIds] = useState<Set<string>>(new Set());
  const [bustHandIndex, setBustHandIndex] = useState<number | null>(null);
  const [isPostDoublePause, setIsPostDoublePause] = useState(false);
  const [dealerRevealCount, setDealerRevealCount] = useState(0);
  const [showOutcome, setShowOutcome] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSplitSeparating, setIsSplitSeparating] = useState(false);
  const [splitOriginalCards, setSplitOriginalCards] = useState<[Card, Card] | null>(null);
  const [isCheckingBlackjack, setIsCheckingBlackjack] = useState(false);
  const [dealerCheckMessage, setDealerCheckMessage] = useState<string | null>(null);

  const dealtHandKeyRef = useRef<string | null>(null);
  const seenCardIdsRef = useRef<Set<string>>(new Set());
  const advancedSignatureRef = useRef<string | null>(null);
  const naturalSignatureRef = useRef<string | null>(null);
  const dealerCheckSignatureRef = useRef<string | null>(null);
  const redecideSignatureRef = useRef<string | null>(null);

  // Same synchronous-consistency reasoning as isDealingRef below: the
  // split-separating window is set and read within the same handler/commit,
  // so other effects that gate on it need the ref, not the (one-render-late) state.
  const isSplitSeparatingRef = useRef(false);

  // Mirrors `isDealing` synchronously. When a fresh hand starts, this
  // effect and the natural/redecide/advance effects below all run in the
  // same commit; `setIsDealing(true)` doesn't take effect until the next
  // render, so those other effects would still see the *previous* hand's
  // (possibly false) isDealing value if they read the state directly. The
  // ref is updated in the same synchronous step, so effects that check it
  // instead never act on a hand before its opening deal has been marked
  // as started.
  const isDealingRef = useRef(true);

  // --- Opening deal: player1, dealer-up, player2, dealer-hole ----------
  // useLayoutEffect (not useEffect): a new hand can arrive with
  // currentDecision already populated in the same session update (see
  // continueToNextHand), so isDealing must flip back to true before the
  // browser paints — otherwise that one frame renders with the previous
  // hand's (false) isDealing and the action buttons flash on screen.
  useLayoutEffect(() => {
    if (!session || session.phase !== "playing" || session.hands.length !== 1) return;
    const hand = session.hands[0];
    if (hand.cards.length !== 2 || hand.hasActed) return;

    const handKey = hand.cards[0]?.id;
    if (!handKey || dealtHandKeyRef.current === handKey) return;
    dealtHandKeyRef.current = handKey;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    isDealingRef.current = true;
    setIsDealing(true);
    setDealtCount(0);

    const step = (count: number) => {
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setDealtCount(count);
          if (count < 4) {
            step(count + 1);
          } else {
            timers.push(
              setTimeout(() => {
                if (cancelled) return;
                isDealingRef.current = false;
                setIsDealing(false);
              }, DEAL_CARD_TRAVEL_MS),
            );
          }
        }, DEAL_PAUSE_BETWEEN_CARDS_MS),
      );
    };
    step(1);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [session]);

  // --- New cards (Hit / Double / Split) animate in once dealt ----------
  // Hand 2 of a split already has its second card in the underlying data
  // (both split hands are dealt in the same synchronous step, unchanged),
  // but it stays out of `seenCardIdsRef` — and out of eligibility below —
  // until hand 1 is actually done, so it animates in only once play
  // reaches it, as item 3 asks for, without touching how/when the game
  // hook itself deals cards.
  useEffect(() => {
    if (!session) return;

    if (isDealingRef.current) {
      // The opening deal owns its own reveal sequence; just record these
      // ids so they are never re-animated once dealing finishes.
      session.hands.forEach((hand) => hand.cards.forEach((card) => seenCardIdsRef.current.add(card.id)));
      return;
    }

    if (isSplitSeparatingRef.current) {
      // The split-apart animation owns this window; new cards (including
      // each split hand's second card) are intentionally left undetected
      // here so they animate in once the separation finishes.
      return;
    }

    const hand2Revealed = session.hands.length === 2 && session.currentHandIndex >= 1;

    const newIds: string[] = [];
    session.hands.forEach((hand, idx) => {
      const eligibleCards = idx === 1 && session.hands.length === 2 && !hand2Revealed ? hand.cards.slice(0, 1) : hand.cards;
      eligibleCards.forEach((card) => {
        if (!seenCardIdsRef.current.has(card.id)) {
          newIds.push(card.id);
          seenCardIdsRef.current.add(card.id);
        }
      });
    });

    if (newIds.length === 0) return;

    setAnimatingCardIds(new Set(newIds));
    const timer = setTimeout(() => setAnimatingCardIds(new Set()), CARD_DEAL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [session, isDealing, isSplitSeparating]);

  // --- Natural blackjack: pause on "Blackjack!" then settle -------------
  useEffect(() => {
    if (!session || session.phase !== "playing" || isDealingRef.current || isSplitSeparatingRef.current) return;
    const hand = session.hands[session.currentHandIndex];
    if (!hand) return;
    if (!(hand.status === "settled" && hand.cards.length === 2 && !hand.hasActed && isNaturalBlackjack(hand.cards))) {
      return;
    }

    const signature = `${session.currentHandIndex}-${hand.cards[0].id}`;
    if (naturalSignatureRef.current === signature) return;
    naturalSignatureRef.current = signature;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) continueToNextHand();
    }, NATURAL_BLACKJACK_PAUSE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, isDealing, isSplitSeparating, continueToNextHand]);

  // --- Dealer blackjack check (upcard Ace/10-value only) ----------------
  // A visible "peek" beat before the player's first decision — or before
  // settling, if the dealer forced the hand straight to "settled" — so it
  // reads as the dealer specifically checking, not just a pause. This is
  // presentation only: it never touches hand.status or currentDecision,
  // which useBasicStrategyGame has already computed correctly; it only
  // delays *showing* the result (action buttons, or the settle) behind
  // the tilt/message sequence. Player naturals are excluded — they have
  // no decision to protect and already run their own settle effect above.
  useEffect(() => {
    if (!session || session.phase !== "playing" || isDealingRef.current || isSplitSeparatingRef.current) return;
    // Restricted to the single, unsplit hand: the dealer peek happens once
    // per round, before any decision (including a Split) — not again for a
    // split hand's own first decision, which also starts unacted at 2 cards.
    if (session.hands.length !== 1) return;
    const hand = session.hands[0];
    if (hand.hasActed || hand.cards.length !== 2 || isNaturalBlackjack(hand.cards)) return;

    const upcard = session.dealerUpcard;
    const dealerShowsPeekCard = upcard.rank === "A" || rankToValue(upcard.rank) === 10;
    if (!dealerShowsPeekCard) return;

    const signature = `${session.currentHandIndex}-${hand.cards[0].id}`;
    if (dealerCheckSignatureRef.current === signature) return;
    dealerCheckSignatureRef.current = signature;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    setIsCheckingBlackjack(true);
    setDealerCheckMessage("Checking for blackjack...");

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        const dealerHasBlackjack = isNaturalBlackjack([session.dealerUpcard, session.dealerHoleCard]);
        setDealerCheckMessage(dealerHasBlackjack ? "Dealer has blackjack" : "Dealer does not have blackjack");

        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setIsCheckingBlackjack(false);
            setDealerCheckMessage(null);
            if (dealerHasBlackjack) continueToNextHand();
          }, DEALER_CHECK_RESULT_MS),
        );
      }, DEALER_CHECK_PAUSE_MS),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [session, isDealing, isSplitSeparating, continueToNextHand]);

  // --- Re-decide after a non-busting Hit (fresh total, same hand) ------
  useEffect(() => {
    if (!session || session.phase !== "playing" || isDealingRef.current || isSplitSeparatingRef.current) return;
    const hand = session.hands[session.currentHandIndex];
    if (!hand) return;
    if (hand.status !== "playing" || !hand.hasActed || session.currentDecision) return;

    // Must be unique per hand-instance, not just per (index, card count) —
    // otherwise a later round reaching the same hand index and card count
    // (e.g. any hand's first Hit, which is always index 0 -> 3 cards)
    // matches a stale signature from an earlier hand and this effect
    // silently never fires again, leaving currentDecision null forever.
    const signature = `${session.currentHandIndex}-${hand.cards.length}-${session.completedHandCount}`;
    if (redecideSignatureRef.current === signature) return;
    redecideSignatureRef.current = signature;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) continueToNextHand();
    }, CARD_DEAL_ANIMATION_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, isDealing, isSplitSeparating, continueToNextHand]);

  // --- Advance past a settled hand: bust pause / post-double pause -----
  useEffect(() => {
    if (!session || session.phase !== "playing" || isDealingRef.current || isSplitSeparatingRef.current) return;
    const hand = session.hands[session.currentHandIndex];
    if (!hand || hand.status !== "settled") return;
    if (hand.cards.length === 2 && !hand.hasActed) return; // natural / dealer-blackjack effects own this

    const signature = `${session.currentHandIndex}-${hand.cards.length}-${session.completedHandCount}`;
    if (advancedSignatureRef.current === signature) return;
    advancedSignatureRef.current = signature;

    const busted = isBust(hand.cards);
    const handIndex = session.currentHandIndex;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Deferred via setTimeout(0) so no state is set synchronously in the effect body.
    timers.push(
      setTimeout(() => {
        if (cancelled) return;

        if (busted) {
          setBustHandIndex(handIndex);
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setBustHandIndex(null);
              continueToNextHand();
            }, BUST_MESSAGE_PAUSE_MS),
          );
        } else if (hand.hasDoubled) {
          setIsPostDoublePause(true);
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setIsPostDoublePause(false);
              continueToNextHand();
            }, POST_DOUBLE_PAUSE_MS),
          );
        } else {
          continueToNextHand();
        }
      }, 0),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [session, isDealing, isSplitSeparating, continueToNextHand]);

  // --- Dealer reveal: one card at a time, then the outcome -------------
  // useLayoutEffect (not useEffect), and the reset runs synchronously in
  // the effect body rather than behind a deferred setTimeout(0): the
  // settling hand (bust/double) flips phase to "hand-complete" from a
  // setTimeout callback, and without this, the frame that paints
  // immediately after still shows the *previous* hand's stale
  // showOutcome/dealerRevealCount — flashing "Next Hand" a beat too early
  // and delaying the visible start of the dealer reveal by a full tick.
  useLayoutEffect(() => {
    if (session?.phase !== "hand-complete" || !session.currentHandOutcome) return;

    const dealerCards = session.currentHandOutcome[0].dealerCards;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const reveal = (count: number) => {
      if (cancelled) return;
      setDealerRevealCount(count);

      if (count < dealerCards.length) {
        timers.push(setTimeout(() => reveal(count + 1), DEALER_CARD_REVEAL_INTERVAL_MS));
      } else {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setShowOutcome(true);
          }, OUTCOME_REVEAL_DELAY_MS),
        );
      }
    };

    setShowOutcome(false);
    reveal(1);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [session?.phase, session?.currentHandOutcome]);

  // --- Player actions: grade + toast; sequencing is handled by the -----
  // --- effects above, reacting to the resulting session state.       ---
  const handleAction = useCallback(
    (action: FinalAction) => {
      // Capture the pre-split two cards before submitDecision mutates the
      // hand, so the separating animation has something to slide apart.
      const preSplitCards: [Card, Card] | null =
        action === "split" && session
          ? (() => {
              const hand = session.hands[session.currentHandIndex];
              return hand && hand.cards.length === 2 ? [hand.cards[0], hand.cards[1]] : null;
            })()
          : null;

      const decision = submitDecision(action);
      if (!decision) return;

      const toastId = Math.random().toString(36);
      const message = decision.isCorrect ? "Correct" : `Correct play: ${capitalizeAction(decision.correctAction)}`;
      setToasts((prev) => [...prev, { id: toastId, message, isCorrect: decision.isCorrect ?? false }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, TOAST_DURATION_MS);

      if (action === "split") {
        // The two new cards were already dealt to both hands in that one
        // submitDecision call (unchanged game-hook behavior). Hold the
        // "still one hand" visual for SPLIT_APART_DURATION_MS, sliding the
        // original two cards apart, before advancing — which is what
        // actually generates hand 1's decision and unlocks play, and what
        // lets the (already-gated) new-card effect start revealing hand
        // 1's second card. Hand 2's second card stays hidden until play
        // reaches it (see the new-card effect above).
        isSplitSeparatingRef.current = true;
        setIsSplitSeparating(true);
        setSplitOriginalCards(preSplitCards);

        setTimeout(() => {
          isSplitSeparatingRef.current = false;
          setIsSplitSeparating(false);
          setSplitOriginalCards(null);
          continueToNextHand();
        }, SPLIT_APART_DURATION_MS);
      }
    },
    [session, submitDecision, continueToNextHand],
  );

  return {
    isDealing,
    dealtCount,
    animatingCardIds,
    bustHandIndex,
    isPostDoublePause,
    isSplitSeparating,
    splitOriginalCards,
    dealerRevealCount,
    showOutcome,
    toasts,
    isCheckingBlackjack,
    dealerCheckMessage,
    handleAction,
  };
}
