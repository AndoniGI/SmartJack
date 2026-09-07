"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveCountGame, SESSION_LENGTH } from "./hooks/useLiveCountGame";
import { useTableAnimation } from "@/app/training/basic-strategy/hooks/useTableAnimation";
import { type Hand } from "@/lib/hand";
import { canSplit, isNaturalBlackjack } from "@/lib/hand";
import { DealerRow, HandSlot, ActionButton, getCardBackAssetPath } from "../_shared/components/BlackjackTable";
import { StrategyChartToggle } from "../_shared/components/StrategyChartToggle";
import "../basic-strategy/basic-strategy.css";
import "./live-count.css";

function formatAccuracy(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

// Fixed number of decorative card-back layers drawn inside the shoe casing.
// Purely visual texture — the *height* of the clipped stack (driven by the
// real cardsRemaining/totalCards fraction) is what actually communicates
// depletion, not this count.
const SHOE_VISUAL_LAYERS = 6;

/**
 * Decorative shoe/deck indicator: a dark casing containing a stack of the
 * same red card-back asset used for the dealer's hole card. The visible
 * stack height is clipped to `fillFraction` (real cardsRemaining/totalCards
 * from the persistent shoe), so it shrinks continuously as cards are
 * actually dealt — never a per-hand step. No counts or numbers are shown.
 */
function ShoeIndicator({ fillFraction }: { fillFraction: number }) {
  const clampedFraction = Math.max(0, Math.min(1, fillFraction));
  const cardBack = getCardBackAssetPath();

  return (
    <div className="shoe-indicator" aria-label="Dealing from a persistent 6-deck shoe" title="6-deck shoe">
      <div className="shoe-casing">
        <div className="shoe-casing-inner">
          <div className="shoe-cards" style={{ height: `${clampedFraction * 100}%` }}>
            {Array.from({ length: SHOE_VISUAL_LAYERS }).map((_, i) => (
              <img
                key={i}
                src={cardBack}
                alt=""
                className="shoe-card-img"
                style={{ bottom: `${i * 3}px` }}
              />
            ))}
          </div>
        </div>
        <div className="shoe-slot" />
      </div>
    </div>
  );
}

export default function LiveCountPage() {
  const {
    session,
    startSession,
    submitDecision,
    continueToNextHand,
    resetSession,
    lastCheckpointResult,
    submitCountAnswer,
    continueAfterCheckpoint,
    strategyAccuracy,
    countAccuracy,
    shoeFillFraction,
  } = useLiveCountGame();

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

  const [countAnswer, setCountAnswer] = useState("");

  // Guarded against React Strict Mode's dev-only mount→cleanup→mount replay,
  // which would otherwise call startSession() twice — dealing (and counting)
  // a real, never-shown hand from the persistent shoe before the one that
  // actually gets displayed.
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startSession();
  }, [startSession]);

  const handleContinueAfterCheckpoint = () => {
    setCountAnswer("");
    continueAfterCheckpoint();
  };

  if (!session) {
    return <div>Loading...</div>;
  }

  const currentHand: Hand | undefined = session.hands[session.currentHandIndex];

  if (session.phase === "results") {
    return (
      <main className="training-page basic-strategy-page live-count-page">
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
                <span className="result-label">Strategy Accuracy</span>
                <strong>{formatAccuracy(strategyAccuracy)}</strong>
              </div>
              <div className="result-stat">
                <span className="result-label">Count Accuracy</span>
                <strong>{formatAccuracy(countAccuracy)}</strong>
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

  if (session.phase === "paused") {
    return (
      <main className="training-page basic-strategy-page live-count-page">
        <div className="training-shell basic-strategy-shell">
          <header className="training-header basic-strategy-header">
            <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
              SmartJack
            </Link>
            <nav className="training-nav" aria-label="Training navigation">
              <Link href="/training">Training</Link>
            </nav>
          </header>

          <section className="checkpoint-panel" aria-live="polite">
            {!lastCheckpointResult ? (
              <>
                <p className="checkpoint-eyebrow">
                  Checkpoint — after hand {session.completedHandCount} of {SESSION_LENGTH}
                </p>
                <h2 className="checkpoint-question">What is the running count?</h2>
                <form
                  className="checkpoint-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const parsed = parseInt(countAnswer, 10);
                    if (!Number.isNaN(parsed)) submitCountAnswer(parsed);
                  }}
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    value={countAnswer}
                    onChange={(event) => setCountAnswer(event.target.value)}
                    placeholder="Enter count"
                    className="checkpoint-input"
                    autoFocus
                  />
                  <button type="submit" className="btn-primary checkpoint-submit" disabled={countAnswer === ""}>
                    Submit
                  </button>
                </form>
              </>
            ) : (
              <div
                className={`checkpoint-result ${lastCheckpointResult.isCorrect ? "is-correct" : "is-incorrect"}`}
              >
                {lastCheckpointResult.isCorrect && (
                  <div className="checkpoint-result-badge" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
                <p className="checkpoint-result-headline">
                  {lastCheckpointResult.isCorrect ? "Correct" : "Incorrect"}
                </p>
                <div className="checkpoint-result-details">
                  <div className="checkpoint-result-row">
                    <span className="checkpoint-result-label">Your answer</span>
                    <strong className="checkpoint-result-value">{lastCheckpointResult.userAnswer}</strong>
                  </div>
                  <div className="checkpoint-result-row">
                    <span className="checkpoint-result-label">Actual running count</span>
                    <strong className="checkpoint-result-value">{lastCheckpointResult.actualRunningCount}</strong>
                  </div>
                </div>
                <button type="button" className="btn-primary checkpoint-submit" onClick={handleContinueAfterCheckpoint}>
                  Continue
                </button>
              </div>
            )}
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
  const hand2Revealed = session.hands.length === 2 && session.currentHandIndex >= 1;

  return (
    <main className="training-page basic-strategy-page live-count-page">
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
            <span>
              Hand {session.completedHandCount + 1} of {SESSION_LENGTH}
            </span>
            <span className="live-count-metrics">
              Strategy {formatAccuracy(strategyAccuracy)} · Count {formatAccuracy(countAccuracy)}
            </span>
          </div>

          <StrategyChartToggle />
          <ShoeIndicator fillFraction={shoeFillFraction} />

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
