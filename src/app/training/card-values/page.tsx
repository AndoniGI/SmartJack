"use client";

import Link from "next/link";
import { useState } from "react";

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const suits = ["♠", "♥", "♦", "♣"] as const;
const sessionLength = 10;

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

const answerOptions = [1, 0, -1] as const;

type Card = {
  id: string;
  rank: string;
  suit: string;
  value: number;
};

function getValueLabel(value: number) {
  if (value === 1) return "+1";
  if (value === 0) return "0";
  return "−1";
}

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

export default function CardValuesPage() {
  const [sessionCards, setSessionCards] = useState<Card[]>(() => createSession());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);

  const currentCard = sessionCards[currentIndex];
  const isCorrectAnswer = selectedAnswer !== null && selectedAnswer === currentCard.value;
  const isLastCard = currentIndex === sessionCards.length - 1;
  const accuracy = Math.round((score / sessionCards.length) * 100);

  const handleAnswer = (answer: number) => {
    if (selectedAnswer !== null) {
      return;
    }

    setSelectedAnswer(answer);

    if (answer === currentCard.value) {
      setScore((previous) => previous + 1);
    }
  };

  const handleNextCard = () => {
    if (selectedAnswer === null) {
      return;
    }

    if (isLastCard) {
      setCompleted(true);
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    setSelectedAnswer(null);
  };

  const startNewSession = () => {
    setSessionCards(createSession());
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setScore(0);
    setCompleted(false);
  };

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
                <span className="result-label">Correct</span>
                <strong>{score} / {sessionCards.length}</strong>
              </div>

              <div className="result-stat">
                <span className="result-label">Accuracy</span>
                <strong>{accuracy}%</strong>
              </div>
            </div>

            <div className="results-actions">
              <button type="button" className="btn-primary card-values-submit" onClick={startNewSession}>
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
          <div className="card-values-meta">
            <span className="card-values-progress">Card {currentIndex + 1} of {sessionCards.length}</span>
            <span className="card-values-score">Score: {score}</span>
          </div>

          <div className="card-stage">
            <article className="playing-card" aria-label={`${currentCard.rank} of ${currentCard.suit}`}>
              <img
                src={getCardAssetPath(currentCard.rank, currentCard.suit)}
                alt={`${currentCard.rank} of ${currentCard.suit}`}
                className="playing-card-image"
              />
            </article>
          </div>

          <div className="answer-grid" aria-label="Choose the Hi-Lo value">
            {answerOptions.map((answer) => (
              <button
                key={answer}
                type="button"
                className={`answer-button ${selectedAnswer === answer ? "selected" : ""}`}
                onClick={() => handleAnswer(answer)}
                disabled={selectedAnswer !== null}
              >
                {getValueLabel(answer)}
              </button>
            ))}
          </div>

          {selectedAnswer !== null && (
            <div className="assessment-feedback" aria-live="polite">
              <p className={isCorrectAnswer ? "feedback correct" : "feedback incorrect"}>
                {isCorrectAnswer ? "Correct!" : `Incorrect. Correct value: ${getValueLabel(currentCard.value)}`}
              </p>

              <button type="button" className="btn-primary card-values-submit" onClick={handleNextCard}>
                {isLastCard ? "See Results" : "Next Card"}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
