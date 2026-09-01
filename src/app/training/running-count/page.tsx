"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const suits = ["♠", "♥", "♦", "♣"] as const;
const sessionLength = 10;
const cardDisplayDuration = 1350; // milliseconds

const suitToFolder: Record<string, string> = {
  "♠": "spades",
  "♥": "hearts",
  "♦": "diamonds",
  "♣": "clubs",
};

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

const rankValueMap: Record<string, number> = {
  "2": 1,
  "3": 1,
  "4": 1,
  "5": 1,
  "6": 1,
  "7": 0,
  "8": 0,
  "9": 0,
  "10": -1,
  J: -1,
  Q: -1,
  K: -1,
  A: -1,
};

type Card = {
  id: string;
  rank: string;
  suit: string;
  value: number;
};

function getRandomCard(): Card {
  const rank = ranks[Math.floor(Math.random() * ranks.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];

  return {
    id: `${rank}-${suit}-${Math.random().toString(36).slice(2, 9)}`,
    rank,
    suit,
    value: rankValueMap[rank],
  };
}

function getCardAssetPath(rank: string, suit: string) {
  const suitFolder = suitToFolder[suit];
  const rankName = rankToAssetName[rank];
  const filename = `${rankName} of ${suitFolder}`;

  return `/cards/card fronts/${encodeURIComponent(suitFolder)}/${encodeURIComponent(filename)}.svg`;
}

function createSession() {
  return Array.from({ length: sessionLength }, () => getRandomCard());
}

function createPlaceholderSession(): Card[] {
  return Array.from({ length: sessionLength }, (_, index) => ({
    id: `placeholder-${index}`,
    rank: "A",
    suit: "♠",
    value: -1,
  }));
}

export default function RunningCountPage() {
  const [sessionCards, setSessionCards] = useState<Card[]>(() => createPlaceholderSession());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setSessionCards(createSession());
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    if (currentIndex >= sessionCards.length) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      if (currentIndex + 1 < sessionCards.length) {
        setCurrentIndex((previous) => previous + 1);
      } else {
        setIsPlaying(false);
      }
    }, cardDisplayDuration);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, sessionCards.length]);

  const startSequence = () => {
    setCurrentIndex(0);
    setIsPlaying(true);
    setUserAnswer("");
    setSubmitted(false);
  };

  const calculateCorrectCount = () => {
    return sessionCards.reduce((sum, card) => sum + card.value, 0);
  };

  const handleSubmitAnswer = () => {
    setSubmitted(true);
  };

  const handleTryAgain = () => {
    setSessionCards(createSession());
    setCurrentIndex(0);
    setIsPlaying(false);
    setUserAnswer("");
    setSubmitted(false);
    setCompleted(false);
  };

  const currentCard = sessionCards[currentIndex];
  const correctCount = calculateCorrectCount();
  const userCount = userAnswer ? parseInt(userAnswer, 10) : null;
  const isCorrectAnswer = userCount === correctCount;

  if (completed) {
    return (
      <main className="training-page card-values-page">
        <div className="training-shell card-values-shell">
          <header className="training-header card-values-header">
            <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
              SmartJack
            </Link>

            <nav className="training-nav" aria-label="Training navigation">
              <Link href="/training">Training</Link>
            </nav>
          </header>

          <section className="card-values-results" aria-live="polite">
            <p className="card-values-eyebrow">Session complete</p>
            <h1 className="training-title card-values-result-title">Results</h1>

            <div className="results-panel">
              <div className="result-stat">
                <span className="result-label">Correct Count</span>
                <strong>{isCorrectAnswer ? "Yes" : "No"}</strong>
              </div>

              <div className="result-stat">
                <span className="result-label">Your Count</span>
                <strong>{userCount}</strong>
              </div>
            </div>

            <div className="results-actions">
              <button type="button" className="btn-primary card-values-submit" onClick={handleTryAgain}>
                Try Again
              </button>
              <Link href="/training" className="btn-secondary card-values-submit">
                Back to Training
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="training-page card-values-page">
        <div className="training-shell card-values-shell">
          <header className="training-header card-values-header">
            <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
              SmartJack
            </Link>

            <nav className="training-nav" aria-label="Training navigation">
              <Link href="/training">Training</Link>
            </nav>
          </header>

          <section className="card-values-panel" aria-live="polite">
            <div className="assessment-feedback">
              <p className={isCorrectAnswer ? "feedback correct" : "feedback incorrect"}>
                {isCorrectAnswer
                  ? "Correct!"
                  : `Incorrect. The correct running count was: ${correctCount}`}
              </p>

              <button type="button" className="btn-primary card-values-submit" onClick={() => setCompleted(true)}>
                See Results
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const isSequenceFinished = !isPlaying && currentIndex >= sessionCards.length - 1;

  if (isSequenceFinished && !submitted) {
    return (
      <main className="training-page card-values-page">
        <div className="training-shell card-values-shell">
          <header className="training-header card-values-header">
            <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
              SmartJack
            </Link>

            <nav className="training-nav" aria-label="Training navigation">
              <Link href="/training">Training</Link>
            </nav>
          </header>

          <section className="card-values-panel" aria-live="polite">
            <h2 className="running-count-question">What is the running count?</h2>

            <div className="running-count-input-group">
              <input
                type="number"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Enter count"
                className="running-count-input"
                disabled={submitted}
                autoFocus
              />
            </div>

            <button
              type="button"
              className="btn-primary card-values-submit"
              onClick={handleSubmitAnswer}
              disabled={userAnswer === ""}
            >
              Submit
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="training-page card-values-page">
      <div className="training-shell card-values-shell">
        <header className="training-header card-values-header">
          <Link href="/training" className="training-brand" aria-label="Back to training dashboard">
            SmartJack
          </Link>

          <nav className="training-nav" aria-label="Training navigation">
            <Link href="/training">Training</Link>
          </nav>
        </header>

        <section className="card-values-panel" aria-live="polite">
          {!isPlaying && currentIndex === 0 ? (
            <div className="running-count-start">
              <h2 className="running-count-title">Running Count</h2>
              <p className="running-count-instructions">
                Watch 10 cards appear on screen. Keep track of the running count using the Hi-Lo system.
              </p>
              <button type="button" className="btn-primary card-values-submit" onClick={startSequence}>
                Start
              </button>
            </div>
          ) : (
            <>
              <div className="card-values-meta">
                <span className="card-values-progress">
                  Card {currentIndex + 1} of {sessionCards.length}
                </span>
              </div>

              <div className="card-stage">
                {isPlaying && currentCard && (
                  <article className="playing-card" aria-label={`${currentCard.rank} of ${currentCard.suit}`}>
                    <img
                      src={getCardAssetPath(currentCard.rank, currentCard.suit)}
                      alt={`${currentCard.rank} of ${currentCard.suit}`}
                      className="playing-card-image"
                    />
                  </article>
                )}
              </div>

              {!isPlaying && currentIndex < sessionCards.length - 1 && (
                <div className="running-count-loading">
                  <p className="running-count-wait-text">Loading next card...</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
