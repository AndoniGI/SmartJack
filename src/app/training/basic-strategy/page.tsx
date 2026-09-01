"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBasicStrategyGame } from "./hooks/useBasicStrategyGame";
import { useTableAnimation } from "./hooks/useTableAnimation";
import { type Card, type Hand } from "@/lib/hand";
import { canSplit, getBestTotal, isBust, isNaturalBlackjack } from "@/lib/hand";
import { type HandResult } from "./hooks/useBasicStrategyGame";
import "./basic-strategy.css";

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

function getCardAssetPath(rank: string, suit: string) {
  const suitFolder = suitToFolder[suit];
  const rankName = rankToAssetName[rank];
  const filename = `${rankName} of ${suitFolder}`;
  return `/cards/card fronts/${encodeURIComponent(suitFolder)}/${encodeURIComponent(filename)}.svg`;
}

// The real asset on disk is "card back red.svg" inside "card backs" — both
// segments contain spaces, so each is percent-encoded individually rather
// than encoding the joined path (which would also escape the "/").
function getCardBackAssetPath() {
  return `/cards/${encodeURIComponent("card backs")}/${encodeURIComponent("card back red.svg")}`;
}

function formatTotal(cards: Card[]): string {
  const total = getBestTotal(cards);
  if (isBust(cards)) return `Bust (${total})`;
  return total.toString();
}

type CardAnimation = "none" | "deal" | "shoe" | "split-left" | "split-right";

function animationClassFor(animation: CardAnimation): string {
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

function CardDisplay({
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

function CardBack({ animation = "none" }: { animation?: CardAnimation }) {
  return (
    <article className={`playing-card card-back ${animationClassFor(animation)}`} aria-label="Face-down card">
      <img src={getCardBackAssetPath()} alt="" className="playing-card-image" />
    </article>
  );
}

/** Dealer row: covers the opening deal, normal play (upcard only), settlement reveal, and the blackjack-check peek. */
function DealerRow({
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

/** Small inline grid glyph for the strategy-chart toggle — no image asset needed for the icon itself. */
function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  );
}

function ActionButton({
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

interface HandSlotProps {
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
function HandSlot({
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

export default function BasicStrategyPage() {
  const [isChartOpen, setIsChartOpen] = useState(false);
  const { session, startSession, submitDecision, continueToNextHand, resetSession } = useBasicStrategyGame();
  const {
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
  } = useTableAnimation({ session, submitDecision, continueToNextHand });

  useEffect(() => {
    startSession();
  }, [startSession]);

  if (!session) {
    return <div>Loading...</div>;
  }

  const currentHand: Hand | undefined = session.hands[session.currentHandIndex];

  // Results screen (after 10 hands completed) — unchanged from before.
  if (session.phase === "results") {
    const totalDecisions = session.decisions.length;
    const correctDecisions = session.decisions.filter((d) => d.isCorrect).length;
    const accuracy = totalDecisions > 0 ? Math.round((correctDecisions / totalDecisions) * 100) : 0;

    return (
      <main className="training-page basic-strategy-page">
        <div className="training-shell basic-strategy-shell">
          <header className="training-header basic-strategy-header">
            <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
              SmartJack
            </Link>
            <nav className="training-nav" aria-label="Training navigation">
              <Link href="/training">Training</Link>
            </nav>
          </header>

          <section className="basic-strategy-results" aria-live="polite">
            <p className="basic-strategy-eyebrow">Session complete</p>
            <h1 className="training-title basic-strategy-result-title">Results</h1>

            <div className="results-panel">
              <div className="result-stat">
                <span className="result-label">Correct Decisions</span>
                <strong>
                  {correctDecisions} / {totalDecisions}
                </strong>
              </div>
              <div className="result-stat">
                <span className="result-label">Accuracy</span>
                <strong>{accuracy}%</strong>
              </div>
            </div>

            <div className="results-actions">
              <button type="button" className="btn-primary basic-strategy-submit" onClick={resetSession}>
                Try Again
              </button>
              <Link href="/training" className="btn-secondary basic-strategy-submit">
                Back to Training
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const isHandComplete = session.phase === "hand-complete" && session.currentHandOutcome;
  const outcomes = isHandComplete ? session.currentHandOutcome! : null;
  const settledDealerCards = outcomes ? outcomes[0].dealerCards : null;

  const isSplit = session.hands.length > 1;
  const canAct =
    !isDealing &&
    !isSplitSeparating &&
    !isHandComplete &&
    !isCheckingBlackjack &&
    bustHandIndex === null &&
    !isPostDoublePause &&
    session.currentDecision;
  // Hand 2's second card is already dealt in the data (unchanged game-hook
  // behavior) but stays visually hidden until play actually reaches it —
  // see the "new cards" effect in useTableAnimation.ts for the matching gate.
  const hand2Revealed = session.hands.length === 2 && session.currentHandIndex >= 1;

  return (
    <main className="training-page basic-strategy-page">
      <div className="training-shell basic-strategy-shell">
        <header className="training-header basic-strategy-header">
          <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
            SmartJack
          </Link>
          <nav className="training-nav" aria-label="Training navigation">
            <Link href="/training">Training</Link>
          </nav>
        </header>

        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.isCorrect ? "correct" : "incorrect"}`}>
              {toast.isCorrect ? "✓" : "✕"} {toast.message}
            </div>
          ))}
        </div>

        <section className="basic-strategy-panel table-panel compact" aria-live="polite">
          <div className="table-corner-meta">
            <span>Hand {session.completedHandCount + 1} of 10</span>
            <span className="table-corner-score">Score: {session.sessionScore}</span>
          </div>

          <button
            type="button"
            className="strategy-chart-toggle"
            onClick={() => setIsChartOpen((open) => !open)}
            aria-label={isChartOpen ? "Close strategy chart" : "Open strategy chart"}
            aria-pressed={isChartOpen}
            title="Basic strategy chart"
          >
            <ChartIcon />
          </button>

          {isChartOpen && (
            <div
              className="strategy-chart-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Basic strategy chart"
              onClick={() => setIsChartOpen(false)}
            >
              <div className="strategy-chart-panel" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="strategy-chart-close"
                  onClick={() => setIsChartOpen(false)}
                  aria-label="Close strategy chart"
                >
                  ×
                </button>
                <img
                  src="/strategy/basic-strategy-chart.png"
                  alt="Basic strategy chart"
                  className="strategy-chart-image"
                />
              </div>
            </div>
          )}

          <div className="table-layout">
            <div className="table-surface">
              <div className="dealer-stage">
                <h3 className="dealer-label">Dealer</h3>
                {isDealing ? (
                  dealtCount >= 2 ? (
                    <DealerRow upcard={session.dealerUpcard} showFaceDownHole={dealtCount >= 4} />
                  ) : (
                    <div className="dealer-section" />
                  )
                ) : isCheckingBlackjack ? (
                  <DealerRow
                    upcard={session.dealerUpcard}
                    showFaceDownHole
                    isChecking
                    checkMessage={dealerCheckMessage}
                  />
                ) : isHandComplete && settledDealerCards ? (
                  <DealerRow
                    upcard={settledDealerCards[0]}
                    settledCards={settledDealerCards}
                    revealCount={dealerRevealCount}
                  />
                ) : (
                  <DealerRow upcard={session.dealerUpcard} />
                )}
              </div>

              <div className={`player-row ${isSplit || isSplitSeparating ? "split" : ""}`}>
                {isSplitSeparating && splitOriginalCards ? (
                  <>
                    <HandSlot
                      cards={[splitOriginalCards[0]]}
                      label="Hand 1"
                      isSplit
                      splitAnim="left"
                      totalText=""
                    />
                    <HandSlot
                      cards={[splitOriginalCards[1]]}
                      label="Hand 2"
                      isSplit
                      splitAnim="right"
                      totalText=""
                    />
                  </>
                ) : isDealing ? (
                  <HandSlot
                    cards={
                      currentHand
                        ? currentHand.cards.slice(0, dealtCount >= 3 ? 2 : dealtCount >= 1 ? 1 : 0)
                        : []
                    }
                    label="Your Hand"
                    isSplit={false}
                    isDealingIn
                    totalText={dealtCount >= 3 ? undefined : ""}
                  />
                ) : (
                  session.hands.map((hand, idx) => {
                    const handOutcome = outcomes?.[idx];
                    const isHand2Gated = idx === 1 && isSplit && !hand2Revealed;
                    const visibleCards = isHand2Gated ? hand.cards.slice(0, 1) : hand.cards;
                    // Hand 2's second card already exists in the data before it's
                    // visually revealed (see hand2Revealed above) — don't let
                    // "Blackjack!" show while that card is still hidden.
                    const isCurrentNatural =
                      !isHand2Gated && hand.cards.length === 2 && !hand.hasActed && isNaturalBlackjack(hand.cards);

                    return (
                      <HandSlot
                        key={idx}
                        cards={visibleCards}
                        label={`Hand ${idx + 1}`}
                        isSplit={isSplit}
                        isActive={isSplit && idx === session.currentHandIndex && !isHandComplete}
                        isInactive={isSplit && idx !== session.currentHandIndex && !isHandComplete}
                        isBusting={bustHandIndex === idx}
                        isNatural={isCurrentNatural}
                        animatingCardIds={animatingCardIds}
                        wasDoubled={hand.hasDoubled}
                        outcome={handOutcome?.outcome}
                        playerBust={handOutcome?.playerBust}
                        showOutcome={Boolean(isHandComplete && showOutcome)}
                        totalText={handOutcome ? handOutcome.playerTotal.toString() : isHand2Gated ? "" : undefined}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div className="actions-rail" aria-label="Choose your action">
              {canAct && currentHand ? (
                <>
                  <ActionButton label="Hit" variant="hit" onClick={() => handleAction("hit")} />
                  <ActionButton label="Stand" variant="stand" onClick={() => handleAction("stand")} />
                  {currentHand.cards.length === 2 && (
                    <ActionButton label="Double" variant="double" onClick={() => handleAction("double")} />
                  )}
                  {canSplit(currentHand) && (
                    <ActionButton label="Split" variant="split" onClick={() => handleAction("split")} />
                  )}
                </>
              ) : null}
            </div>
          </div>

          {isHandComplete && showOutcome && (
            <button
              type="button"
              className="btn-primary outcome-next-button"
              onClick={() => continueToNextHand()}
            >
              Next Hand
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
