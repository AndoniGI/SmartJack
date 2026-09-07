"use client";

import { useCallback } from "react";
import { type Card } from "@/lib/hand";
import { useBlackjackSession, type Decision, type HandResult, type GameSessionState } from "@/lib/blackjackSession";

export type { Decision, HandResult, GameSessionState };

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const suits = ["♠", "♥", "♦", "♣"] as const;

const SESSION_LENGTH = 10;

/**
 * Hook for managing Level 3 basic-strategy game.
 *
 * Thin wrapper around the shared round engine (useBlackjackSession): supplies
 * an infinite random-draw card source (unchanged from before extraction) and
 * the 10-hand session length. All gameplay rules live in
 * src/lib/blackjackSession.ts.
 */
export function useBasicStrategyGame() {
  const generateCard = useCallback((): Card => {
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    return {
      id: `${rank}-${suit}-${Date.now()}-${Math.random()}`,
      rank,
      suit,
    };
  }, []);

  return useBlackjackSession({ drawCard: generateCard, sessionLength: SESSION_LENGTH });
}
