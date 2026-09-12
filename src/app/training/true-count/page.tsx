"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useTrueCountGame,
  SESSION_LENGTH,
  type CheckpointStage,
} from "./hooks/useTrueCountGame";
import { useTableAnimation } from "@/app/training/basic-strategy/hooks/useTableAnimation";
import { type Hand } from "@/lib/hand";
import { canSplit, isNaturalBlackjack } from "@/lib/hand";
import { DealerRow, HandSlot, ActionButton } from "../_shared/components/BlackjackTable";
import { StrategyChartToggle } from "../_shared/components/StrategyChartToggle";
import "../basic-strategy/basic-strategy.css";
import "../live-count/live-count.css";
import "./true-count.css";

function formatAccuracy(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

const CHECKPOINT_QUESTION: Record<CheckpointStage, string> = {
  "running-count": "What is the running count?",
  "decks-remaining": "Approx. decks remaining",
  "true-count": "What is the true count?",
};

const CHECKPOINT_STEP_INDEX: Record<CheckpointStage, number> = {
  "running-count": 0,
  "decks-remaining": 1,
  "true-count": 2,
};

function CheckpointResultRow({
  label,
  isCorrect,
  userAnswer,
  actual,
}: {
  label: string;
  isCorrect: boolean;
  userAnswer: number;
  actual: number;
}) {
  return (
    <div className={`checkpoint-result-row ${isCorrect ? "correct" : "incorrect"}`}>
      <span className="checkpoint-result-row-icon" aria-hidden="true">
        {isCorrect ? "✓" : "✕"}
      </span>
      <span className="checkpoint-result-label">{label}</span>
      <span className="checkpoint-result-answer">
        You: <strong>{userAnswer}</strong> · Actual: <strong>{actual}</strong>
      </span>
    </div>
  );
}

export default function TrueCountPage() {
  const {
    session,
    startSession,
    submitDecision,
    continueToNextHand,
    resetSession,
    checkpointStage,
    lastCheckpointResult,
    decksRemainingShown,
    submitRunningCountAnswer,
    acknowledgeDecksRemaining,
    submitTrueCountAnswer,
    continueAfterCheckpoint,
    strategyAccuracy,
    runningCountAccuracy,
    trueCountAccuracy,
  } = useTrueCountGame();

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

  const [answerText, setAnswerText] = useState("");

  // Guarded against React Strict Mode's dev-only mount→cleanup→mount replay,
  // which would otherwise call startSession() twice — dealing (and counting)
  // a real, never-shown hand from the persistent shoe before the one that
  // actually gets displayed. (Same fix as Level 4 — see useLiveCountGame.)
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startSession();
  }, [startSession]);

  const handleContinueAfterCheckpoint = () => {
    setAnswerText("");
    continueAfterCheckpoint();
  };

  if (!session) {
    return <div>Loading...</div>;
  }

  const currentHand: Hand | undefined = session.hands[session.currentHandIndex];

  if (session.phase === "results") {
    return (
      <main className="training-page basic-strategy-page live-count-page true-count-page">
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
                <span className="result-label">Running Count Accuracy</span>
                <strong>{formatAccuracy(runningCountAccuracy)}</strong>
              </div>
              <div className="result-stat">
                <span className="result-label">True Count Accuracy</span>
                <strong>{formatAccuracy(trueCountAccuracy)}</strong>
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
    const correctCount = lastCheckpointResult
      ? [lastCheckpointResult.runningCount.isCorrect, lastCheckpointResult.trueCount.isCorrect].filter(Boolean).length
      : 0;
    const resultTone = correctCount === 2 ? "is-correct" : correctCount === 0 ? "is-incorrect" : "is-partial";

    return (
      <main className="training-page basic-strategy-page live-count-page true-count-page">
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
                <div className="checkpoint-progress" aria-hidden="true">
                  {[0, 1, 2].map((step) => (
                    <span
                      key={step}
                      className={`checkpoint-progress-dot ${step <= CHECKPOINT_STEP_INDEX[checkpointStage] ? "active" : ""}`}
                    />
                  ))}
                </div>
                <h2 className="checkpoint-question">{CHECKPOINT_QUESTION[checkpointStage]}</h2>

                {checkpointStage === "decks-remaining" ? (
                  <>
                    <p className="decks-remaining-readout">
                      Approx. decks remaining: <strong>{decksRemainingShown}</strong>
                    </p>
                    <button
                      type="button"
                      className="btn-primary checkpoint-submit"
                      onClick={acknowledgeDecksRemaining}
                    >
                      Continue
                    </button>
                  </>
                ) : (
                  <form
                    className="checkpoint-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const parsed = parseInt(answerText, 10);
                      if (Number.isNaN(parsed)) return;
                      setAnswerText("");
                      if (checkpointStage === "running-count") submitRunningCountAnswer(parsed);
                      else submitTrueCountAnswer(parsed);
                    }}
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      placeholder="Enter a number"
                      className="checkpoint-input"
                      autoFocus
                    />
                    <button type="submit" className="btn-primary checkpoint-submit" disabled={answerText === ""}>
                      Submit
                    </button>
                  </form>
                )}
              </>
            ) : (
              <div className={`checkpoint-result ${resultTone}`}>
                {resultTone === "is-correct" && (
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
                <p className="checkpoint-result-headline">{correctCount} of 2 Correct</p>
                <div className="checkpoint-result-details">
                  <CheckpointResultRow
                    label="Running Count"
                    isCorrect={lastCheckpointResult.runningCount.isCorrect}
                    userAnswer={lastCheckpointResult.runningCount.userAnswer}
                    actual={lastCheckpointResult.runningCount.actual}
                  />
                  <CheckpointResultRow
                    label="True Count"
                    isCorrect={lastCheckpointResult.trueCount.isCorrect}
                    userAnswer={lastCheckpointResult.trueCount.userAnswer}
                    actual={lastCheckpointResult.trueCount.actual}
                  />
                  <p className="checkpoint-result-context">
                    Decks remaining shown: <strong>{lastCheckpointResult.decksRemainingShown}</strong>
                  </p>
                  {!lastCheckpointResult.trueCount.isCorrect && lastCheckpointResult.conversionCorrect && (
                    <p className="checkpoint-result-diagnostic">
                      ✓ Conversion method correct — the running count you entered was off, not the math
                    </p>
                  )}
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
    <main className="training-page basic-strategy-page live-count-page true-count-page">
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
            <span className="live-count-metrics">Strategy {formatAccuracy(strategyAccuracy)}</span>
          </div>

          <StrategyChartToggle />

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
