"use client";

import Link from "next/link";
import { type FinalAction } from "@/data/basicStrategy";
import { canDouble, canSplit } from "@/lib/hand";
import { DealerRow, HandSlot, ActionButton } from "@/app/training/_shared/components/BlackjackTable";
import { StrategyChartToggle } from "@/app/training/_shared/components/StrategyChartToggle";
import { DeviationChartToggle } from "../_shared/components/DeviationChartToggle";
import { actionLabel, formatIndexLabel, formatIndexValue, formatTrueCount } from "../_shared/deviationFormat";
import { useDeviationTeacher } from "./hooks/useDeviationTeacher";
import "../../basic-strategy/basic-strategy.css";
import "../../live-count/live-count.css";
import "../count-deviations.css";

function formatAccuracy(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export default function DeviationTeacherPage() {
  const {
    sessionLength,
    currentScenario,
    currentIndex,
    userAnswer,
    results,
    isComplete,
    accuracy,
    accuracyByRule,
    mode,
    setMode,
    submitAnswer,
    nextScenario,
    resetSession,
  } = useDeviationTeacher();

  if (isComplete) {
    return (
      <main className="training-page count-deviations-page">
        <div className="training-shell count-deviations-shell">
          <header className="training-header">
            <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
              SmartJack
            </Link>
            <nav className="training-nav" aria-label="Training navigation">
              <Link href="/training">Training</Link>
            </nav>
          </header>

          <section className="basic-strategy-results" aria-live="polite">
            <p className="basic-strategy-eyebrow">Session complete</p>
            <h1 className="training-title">Deviation Teacher Results</h1>

            <div className="results-panel">
              <div className="result-stat">
                <span className="result-label">Deviation Accuracy</span>
                <strong>{formatAccuracy(accuracy)}</strong>
              </div>
            </div>

            <div className="deviation-rule-breakdown">
              {Array.from(accuracyByRule.entries()).map(([id, entry]) => (
                <div key={id} className="deviation-rule-row">
                  <span>{entry.label}</span>
                  <span>
                    {entry.correct} / {entry.total}
                  </span>
                </div>
              ))}
            </div>

            <div className="results-actions">
              <button type="button" className="btn-primary basic-strategy-submit" onClick={resetSession}>
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

  if (!currentScenario) {
    return <div>Loading...</div>;
  }

  const isInsuranceRep = currentScenario.rule.trigger.kind === "insurance";
  const lastResult = results[results.length - 1] ?? null;
  const hasAnswered = userAnswer !== null;

  const legalActions: FinalAction[] = isInsuranceRep
    ? []
    : (["hit", "stand"] as FinalAction[])
        .concat(canDouble(currentScenario.playerHand) ? ["double"] : [])
        .concat(canSplit(currentScenario.playerHand) ? ["split"] : []);

  return (
    <main className="training-page basic-strategy-page count-deviations-page">
      <div className="training-shell basic-strategy-shell">
        <header className="training-header basic-strategy-header">
          <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
            SmartJack
          </Link>
          <nav className="training-nav" aria-label="Training navigation">
            <Link href="/training">Training</Link>
          </nav>
        </header>

        <section className="basic-strategy-panel table-panel compact deviation-teacher-panel" aria-live="polite">
          <div className="table-corner-meta">
            <span>
              Scenario {currentIndex + 1} of {sessionLength}
            </span>
            <span className="live-count-metrics">Accuracy {formatAccuracy(accuracy)}</span>
          </div>

          <StrategyChartToggle />
          <DeviationChartToggle />

          <div className="deviation-mode-toggle" role="group" aria-label="Guidance level">
            <button
              type="button"
              className={mode === "learn" ? "active" : ""}
              onClick={() => setMode("learn")}
            >
              Learn
            </button>
            <button
              type="button"
              className={mode === "practice" ? "active" : ""}
              onClick={() => setMode("practice")}
            >
              Practice
            </button>
          </div>

          <p className="true-count-banner">TRUE COUNT {formatTrueCount(currentScenario.trueCount)}</p>

          <div className="table-layout">
            <div className="table-surface">
              <div className="dealer-stage">
                <h3 className="dealer-label">Dealer</h3>
                <DealerRow upcard={currentScenario.dealerUpcard} />
              </div>

              <div className="player-row">
                <HandSlot cards={currentScenario.playerHand.cards} label="Your Hand" isSplit={false} />
              </div>
            </div>

            <div
              className={`actions-rail ${hasAnswered ? "actions-rail-feedback" : ""}`}
              aria-label={hasAnswered ? "Result" : "Choose your action"}
            >
              {!hasAnswered ? (
                <>
                  {mode === "learn" && (
                    <p className="deviation-index-hint">Index: {formatIndexLabel(currentScenario.rule)}</p>
                  )}
                  {isInsuranceRep ? (
                    <>
                      <button
                        type="button"
                        className="action-button insurance-yes"
                        onClick={() => submitAnswer("insurance")}
                      >
                        Take Insurance
                      </button>
                      <button
                        type="button"
                        className="action-button insurance-no"
                        onClick={() => submitAnswer("no-insurance")}
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    legalActions.map((action) => (
                      <ActionButton
                        key={action}
                        label={actionLabel(action)}
                        variant={action}
                        onClick={() => submitAnswer(action)}
                      />
                    ))
                  )}
                </>
              ) : (
                lastResult && (
                  <div
                    className={`checkpoint-result deviation-feedback ${lastResult.isCorrect ? "is-correct" : "is-incorrect"}`}
                  >
                    <p className="checkpoint-result-headline deviation-feedback-headline">
                      {lastResult.isCorrect ? "Correct" : "Incorrect"}
                    </p>
                    <div className="deviation-feedback-list">
                      <div className="deviation-feedback-row">
                        <span className="deviation-feedback-label">Basic strategy</span>
                        <strong className="deviation-feedback-value">{actionLabel(lastResult.basicAnswer)}</strong>
                      </div>
                      <div className="deviation-feedback-row">
                        <span className="deviation-feedback-label">Deviation index</span>
                        <strong className="deviation-feedback-value">
                          {formatIndexValue(currentScenario.rule.threshold)}
                        </strong>
                      </div>
                      <div className="deviation-feedback-row">
                        <span className="deviation-feedback-label">Current true count</span>
                        <strong className="deviation-feedback-value">
                          {formatTrueCount(currentScenario.trueCount)}
                        </strong>
                      </div>
                      <div className="deviation-feedback-row deviation-feedback-row-primary">
                        <span className="deviation-feedback-label">Correct play</span>
                        <strong className="deviation-feedback-value">{actionLabel(lastResult.correctAnswer)}</strong>
                      </div>
                    </div>
                    {!lastResult.deviationApplied && (
                      <p className="deviation-feedback-note">
                        Below the index — basic strategy remains correct.
                      </p>
                    )}
                    <button type="button" className="btn-primary deviation-feedback-next" onClick={nextScenario}>
                      {currentIndex + 1 >= sessionLength ? "See Results" : "Next Scenario"}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
