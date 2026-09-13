"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  useCountDeviationsGame,
  SESSION_LENGTH,
  MAX_SPLIT_HANDS,
  type CheckpointStage,
} from "./hooks/useCountDeviationsGame";
import { useTableAnimation } from "@/app/training/basic-strategy/hooks/useTableAnimation";
import { type Hand } from "@/lib/hand";
import { canSplit, isNaturalBlackjack } from "@/lib/hand";
import { DealerRow, HandSlot, ActionButton } from "../../_shared/components/BlackjackTable";
import { StrategyChartToggle } from "../../_shared/components/StrategyChartToggle";
import { DeviationChartToggle } from "../_shared/components/DeviationChartToggle";
import { formatTrueCount } from "../_shared/deviationFormat";
import "../../basic-strategy/basic-strategy.css";
import "../../live-count/live-count.css";
import "../../true-count/true-count.css";
import "../count-deviations.css";

function formatAccuracy(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

// Comfortably longer than useTableAnimation's own CARD_DEAL_ANIMATION_MS
// (320ms) redecide timer, so the stuck-hand watchdog below only ever fires
// as a last resort, never racing the normal post-Hit transition.
const STUCK_HAND_RECOVERY_MS = 900;

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

export default function CountDeviationsCombinedPage() {
  const {
    session,
    startSession,
    submitDecision,
    continueToNextHand,
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
  } = useCountDeviationsGame();

  // Insurance genuinely gates the round while pending: the shared animation
  // engine's dealer-blackjack peek (and the settle it can trigger) must not
  // run until the player has actually answered — see holdForInsurance in
  // useTableAnimation and the file doc comment on useCountDeviationsGame.
  const insurancePending = insuranceStage === "pending";

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
  } = useTableAnimation({ session, submitDecision, continueToNextHand, holdForInsurance: insurancePending });

  const [answerText, setAnswerText] = useState("");

  // Whether the player has confirmed the session-start briefing (starting
  // running count + decks left) yet. Hand 1 is dealt into `session` right
  // away as before (see the mount effect below) so the table behind the
  // briefing overlay is never a blank "Loading..." state — the player just
  // doesn't see it until they click Start Session. A brand-new session from
  // "Try Again" resets this back to false so the new starting figures get
  // their own briefing too.
  const [sessionStarted, setSessionStarted] = useState(false);

  // Guarded against React Strict Mode's dev-only mount->cleanup->mount replay
  // (same fix as Level 4/5).
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startSession();
  }, [startSession]);

  const handleStartSession = () => {
    setSessionStarted(true);
  };

  const handleTryAgain = () => {
    setSessionStarted(false);
    resetSession();
  };

  const handleContinueAfterCheckpoint = () => {
    setAnswerText("");
    continueAfterCheckpoint();
  };

  // Defensive guard: Combined Mode must never remain stuck in a playable
  // hand with no legal-action UI. The normal post-Hit transition is driven
  // entirely by useTableAnimation's own one-shot ~320ms redecide timer; if
  // that single path is ever missed for any reason, nothing else in the
  // shared engine retries it. This watchdog is a slow, independent safety
  // net scoped to Combined Mode only (it never touches useTableAnimation or
  // the shared engine): whenever a hand is still playable and has already
  // been acted on, but has no current decision and nothing else is
  // animating/transitioning, it nudges the engine to recreate the decision
  // after a grace window well past the normal transition time — long enough
  // that it never fires (or interferes) during ordinary play.
  useEffect(() => {
    if (!session || session.phase !== "playing") return;
    if (isDealing || isSplitSeparating || isCheckingBlackjack || isPostDoublePause || bustHandIndex !== null) return;

    const hand = session.hands[session.currentHandIndex];
    if (!hand || hand.status !== "playing" || !hand.hasActed || session.currentDecision) return;

    const timer = setTimeout(() => {
      continueToNextHand();
    }, STUCK_HAND_RECOVERY_MS);

    return () => clearTimeout(timer);
  }, [session, isDealing, isSplitSeparating, isCheckingBlackjack, isPostDoublePause, bustHandIndex, continueToNextHand]);

  if (!session) {
    return <div>Loading...</div>;
  }

  const currentHand: Hand | undefined = session.hands[session.currentHandIndex];

  if (session.phase === "results") {
    return (
      <main className="training-page basic-strategy-page live-count-page true-count-page count-deviations-page">
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
              <div className="result-stat">
                <span className="result-label">Insurance Accuracy</span>
                <strong>{formatAccuracy(insuranceAccuracy)}</strong>
              </div>
              <div className="result-stat">
                <span className="result-label">Deviation Decisions</span>
                <strong>
                  {deviationDecisionsTotal > 0
                    ? `${deviationDecisionsCorrect} / ${deviationDecisionsTotal}`
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="results-actions">
              <button type="button" className="btn-primary basic-strategy-submit" onClick={handleTryAgain}>
                Try Again
              </button>
              <Link href="/training/count-deviations" className="btn-secondary basic-strategy-submit">
                Back to Level 6
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
      <main className="training-page basic-strategy-page live-count-page true-count-page count-deviations-page">
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

  const handCount = session.hands.length;
  const isSplit = handCount > 1;
  const splitLayoutClass = handCount >= 4 ? "hands-4" : handCount === 3 ? "hands-3" : "";
  const canAct =
    !isDealing &&
    !isSplitSeparating &&
    !isHandComplete &&
    !isCheckingBlackjack &&
    !insurancePending &&
    bustHandIndex === null &&
    !isPostDoublePause &&
    session.currentDecision;

  // Insurance is only ever offered on the fresh, unsplit, unacted first hand
  // (see onHandDealt), so it's safe to show once dealing finishes — no need
  // to also wait on isCheckingBlackjack/etc, which holdForInsurance already
  // prevents from ever becoming true while insurancePending is.
  const showInsurancePrompt = insurancePending && !isDealing;

  return (
    <main className="training-page basic-strategy-page live-count-page true-count-page count-deviations-page">
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

        {!sessionStarted && (
          <div
            className="strategy-chart-overlay session-briefing-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Session briefing"
          >
            <div className="strategy-chart-panel session-briefing-panel">
              <p className="checkpoint-eyebrow">Session Start</p>
              <div className="results-panel session-briefing-stats">
                <div className="result-stat">
                  <span className="result-label">Starting Running Count</span>
                  <strong>{formatTrueCount(startingRunningCount)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-label">Decks Left</span>
                  <strong>~{startingDecksRemaining}</strong>
                </div>
              </div>
              <button type="button" className="btn-primary session-briefing-start" onClick={handleStartSession}>
                Start Session
              </button>
            </div>
          </div>
        )}

        <section className="basic-strategy-panel table-panel compact" aria-live="polite">
          <div className="table-corner-meta">
            <span>
              Hand {session.completedHandCount + 1} of {SESSION_LENGTH}
            </span>
            <span className="live-count-metrics">Strategy {formatAccuracy(strategyAccuracy)}</span>
          </div>

          <div className="table-corner-meta table-corner-meta-right" aria-hidden="true">
            <span className="table-corner-decks-label">Decks Left</span>
            <span className="table-corner-decks-value">~{approxDecksRemaining}</span>
          </div>

          <StrategyChartToggle />
          <DeviationChartToggle />

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
                ) : showInsurancePrompt ? (
                  <DealerRow upcard={session.dealerUpcard} showFaceDownHole />
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

              <div className={`player-row ${isSplit || isSplitSeparating ? "split" : ""} ${splitLayoutClass}`}>
                {isDealing ? (
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
                    // A split (or re-split) always replaces the currently-acting
                    // hand's own slot with the two halves sliding apart, and
                    // appends its new hand at the end of the array — so the
                    // hand being split is always at session.currentHandIndex,
                    // and the newly-created hand is always the last index.
                    // Every other hand (already settled, or not yet reached)
                    // renders normally alongside this, so nothing else in the
                    // round disappears during the brief separating animation.
                    if (isSplitSeparating && splitOriginalCards) {
                      const isNewlySplitHand = idx === handCount - 1 && idx !== session.currentHandIndex;
                      if (isNewlySplitHand) return null;

                      if (idx === session.currentHandIndex) {
                        return (
                          <Fragment key={`split-${idx}`}>
                            <HandSlot
                              cards={[splitOriginalCards[0]]}
                              label={`Hand ${idx + 1}`}
                              isSplit
                              splitAnim="left"
                              totalText=""
                            />
                            <HandSlot
                              cards={[splitOriginalCards[1]]}
                              label={`Hand ${handCount}`}
                              isSplit
                              splitAnim="right"
                              totalText=""
                            />
                          </Fragment>
                        );
                      }
                    }

                    const handOutcome = outcomes?.[idx];
                    // A hand's second card is dealt eagerly (alongside every
                    // other split hand) but shouldn't be revealed until play
                    // actually reaches it.
                    const isHandGated = idx > session.currentHandIndex;
                    const visibleCards = isHandGated ? hand.cards.slice(0, 1) : hand.cards;
                    const isCurrentNatural =
                      !isHandGated && hand.cards.length === 2 && !hand.hasActed && isNaturalBlackjack(hand.cards);

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
                        totalText={handOutcome ? handOutcome.playerTotal.toString() : isHandGated ? "" : undefined}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div
              className={`actions-rail ${showInsurancePrompt && lastInsuranceResult ? "actions-rail-feedback" : ""}`}
              aria-label={showInsurancePrompt ? "Insurance decision" : "Choose your action"}
            >
              {showInsurancePrompt ? (
                !lastInsuranceResult ? (
                  <>
                    <p className="insurance-prompt-title">Insurance?</p>
                    <button
                      type="button"
                      className="action-button insurance-yes"
                      onClick={() => submitInsuranceAnswer(true)}
                    >
                      Take
                    </button>
                    <button
                      type="button"
                      className="action-button insurance-no"
                      onClick={() => submitInsuranceAnswer(false)}
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <div
                    className={`checkpoint-result deviation-feedback ${lastInsuranceResult.isCorrect ? "is-correct" : "is-incorrect"}`}
                  >
                    <p className="checkpoint-result-headline deviation-feedback-headline">
                      {lastInsuranceResult.isCorrect ? "Correct" : "Incorrect"}
                    </p>
                    {!lastInsuranceResult.isCorrect && (
                      <p className="deviation-feedback-note">
                        Correct play was to <strong>{lastInsuranceResult.recommended ? "take" : "decline"}</strong>{" "}
                        insurance.
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn-primary deviation-feedback-next"
                      onClick={continueAfterInsurance}
                    >
                      Continue
                    </button>
                  </div>
                )
              ) : canAct && currentHand ? (
                <>
                  <ActionButton label="Hit" variant="hit" onClick={() => handleAction("hit")} />
                  <ActionButton label="Stand" variant="stand" onClick={() => handleAction("stand")} />
                  {currentHand.cards.length === 2 && (
                    <ActionButton label="Double" variant="double" onClick={() => handleAction("double")} />
                  )}
                  {canSplit(currentHand, { totalHandsInRound: handCount, maxHands: MAX_SPLIT_HANDS }) && (
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
