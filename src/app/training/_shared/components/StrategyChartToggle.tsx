"use client";

import { useState } from "react";

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

/**
 * Basic-strategy reference chart toggle + overlay, extracted from Level 3
 * so later levels (e.g. Level 4 live counting) can reuse it verbatim.
 *
 * Fully self-contained: it owns its own open/closed state and touches
 * nothing outside itself, so mounting it on any table page can never affect
 * that page's hand, shoe, count, checkpoint, or animation state.
 */
export function StrategyChartToggle() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="strategy-chart-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close strategy chart" : "Open strategy chart"}
        aria-pressed={isOpen}
        title="Basic strategy chart"
      >
        <ChartIcon />
      </button>

      {isOpen && (
        <div
          className="strategy-chart-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Basic strategy chart"
          onClick={() => setIsOpen(false)}
        >
          <div className="strategy-chart-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="strategy-chart-close"
              onClick={() => setIsOpen(false)}
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
    </>
  );
}
