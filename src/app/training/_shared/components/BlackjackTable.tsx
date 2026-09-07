"use client";

import { type Card } from "@/lib/hand";
import { getBestTotal, isBust } from "@/lib/hand";
import { type HandResult } from "@/lib/blackjackSession";

/**
 * Shared blackjack-table presentational pieces, extracted from Level 3's
 * basic-strategy page so later levels (e.g. Level 4 live counting) can reuse
 * the same table look without duplicating this markup. Purely presentational
 * — no gameplay rules live here.
 */

const rankToAssetName: Record<string, string> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "jack",
  Q: "queen",
  K: "king",
  A: "ace",
};

const suitToFolder: Record<string, string> = {
  "♠": "spades",
  "♥": "hearts",
  "♦": "diamonds",
  "♣": "clubs",
};

export function getCardAssetPath(rank: string, suit: string) {
  const suitFolder = suitToFolder[suit];
  const rankName = rankToAssetName[rank];
  const filename = `${rankName} of ${suitFolder}`;
  return `/cards/card fronts/${encodeURIComponent(suitFolder)}/${encodeURIComponent(filename)}.svg`;
}

// The real asset on disk is "card back red.svg" inside "card backs" — both
// segments contain spaces, so each is percent-encoded individually rather
// than encoding the joined path (which would also escape the "/").
export function getCardBackAssetPath() {
  return `/cards/${encodeURIComponent("card backs")}/${encodeURIComponent("card back red.svg")}`;
}

export function formatTotal(cards: Card[]): string {
  const total = getBestTotal(cards);
  if (isBust(cards)) return `Bust (${total})`;
  return total.toString();
}

export type CardAnimation = "none" | "deal" | "shoe" | "split-left" | "split-right";

export function animationClassFor(animation: CardAnimation): string {
  switch (animation) {
    case "deal":
      return "animate-deal";
    case "shoe":
      return "animate-deal-shoe";
    case "split-left":
      return "split-left";
    case "split-right":
      return "split-right";
    default:
      return "";
  }
}

export function CardDisplay({
  card,
  animation = "none",
  offset = false,
}: {
  card: Card;
  animation?: CardAnimation;
  offset?: boolean;
}) {
  return (
    <article
      className={`playing-card ${animationClassFor(animation)} ${offset ? "double-card" : ""}`}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <img
        src={getCardAssetPath(card.rank, card.suit)}
        alt={`${card.rank} of ${card.suit}`}
        className="playing-card-image"
      />
    </article>
  );
}

export function CardBack({ animation = "none" }: { animation?: CardAnimation }) {
  return (
    <article className={`playing-card card-back ${animationClassFor(animation)}`} aria-label="Face-down card">
      <img src={getCardBackAssetPath()} alt="" className="playing-card-image" />
    </article>
  );
}

/** Dealer row: covers the opening deal, normal play (upcard only), settlement reveal, and the blackjack-check peek. */
export function DealerRow({
  upcard,
  showFaceDownHole,
  settledCards,
  revealCount,
  isChecking,
  checkMessage,
}: {
  upcard: Card;
  showFaceDownHole?: boolean;
  settledCards?: Card[];
  revealCount?: number;
  isChecking?: boolean;
  checkMessage?: string | null;
}) {
  if (settledCards) {
    const visibleCount = Math.max(1, Math.min(revealCount ?? settledCards.length, settledCards.length));
    const cards = settledCards.slice(0, visibleCount);
    const isFullyRevealed = visibleCount === settledCards.length;

    return (
      <div className="dealer-section">
        <div className="dealer-cards-container">
          {cards.map((card, idx) => (
            <div key={card.id} className={`dealer-card ${idx > 0 ? "animate-deal" : ""}`}>
              <CardDisplay card={card} />
            </div>
          ))}
        </div>
        {isFullyRevealed && <p className="dealer-total">Dealer: {getBestTotal(cards)}</p>}
      </div>
    );
  }

  return (
    <div className="dealer-section">
      <div className={`dealer-cards-container ${isChecking ? "dealer-checking" : ""}`}>
        <div className="dealer-card animate-deal-shoe">
          <CardDisplay card={upcard} />
        </div>
        {showFaceDownHole && (
          <div className="dealer-card animate-deal-shoe">
            <CardBack />
          </div>
        )}
      </div>
      {checkMessage && <p className="dealer-check-message">{checkMessage}</p>}
    </div>
  );
}

export function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "hit" | "stand" | "double" | "split";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`action-button ${variant}`}
      onClick={onClick}
      aria-label={`Choose ${label}`}
    >
      {label}
    </button>
  );
}

export interface HandSlotProps {
  cards: Card[];
  label: string;
  isSplit: boolean;
  isActive?: boolean;
  isInactive?: boolean;
  isBusting?: boolean;
  isNatural?: boolean;
  isDealingIn?: boolean;
  splitAnim?: "left" | "right";
  animatingCardIds?: Set<string>;
  wasDoubled?: boolean;
  outcome?: HandResult["outcome"];
  playerBust?: boolean;
  showOutcome?: boolean;
  totalText?: string;
}

/** One player hand — used for a single hand or either side of a split, live or settled. */
export function HandSlot({
  cards,
  label,
  isSplit,
  isActive,
  isInactive,
  isBusting,
  isNatural,
  isDealingIn,
  splitAnim,
  animatingCardIds,
  wasDoubled,
  outcome,
  playerBust,
  showOutcome,
  totalText,
}: HandSlotProps) {
  const outcomeText = playerBust
    ? "BUST"
    : outcome === "win"
      ? isNatural
        ? "BLACKJACK!"
        : "WIN"
      : outcome === "loss"
        ? "LOSS"
        : outcome === "push"
          ? "PUSH"
          : "";
  const outcomeClass = playerBust ? "loss" : outcome === "win" ? "win" : outcome === "loss" ? "loss" : "push";

  return (
    <div
      className={`hand-slot ${isSplit ? "split" : ""} ${isActive ? "active" : ""} ${isInactive ? "inactive" : ""}`}
    >
      {isSplit && <span className="hand-slot-label">{label}</span>}
      <div className="player-hand">
        <div className="cards-container">
          {cards.map((card, idx) => (
            <CardDisplay
              key={card.id}
              card={card}
              animation={
                splitAnim
                  ? splitAnim === "left"
                    ? "split-left"
                    : "split-right"
                  : isDealingIn
                    ? "shoe"
                    : animatingCardIds?.has(card.id)
                      ? "deal"
                      : "none"
              }
              offset={Boolean(wasDoubled) && idx === cards.length - 1 && cards.length > 2}
            />
          ))}
        </div>
        <p className="hand-total">{totalText ?? formatTotal(cards)}</p>
      </div>

      {isNatural && !outcome && <div className="blackjack-badge">Blackjack!</div>}
      {isBusting && <div className="bust-badge">Bust</div>}
      {showOutcome && (outcome || playerBust) && <div className={`outcome-badge ${outcomeClass}`}>{outcomeText}</div>}
    </div>
  );
}
