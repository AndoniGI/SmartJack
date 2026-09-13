"use client";

import { useState } from "react";
import { DEVIATIONS } from "@/data/deviations";
import { actionLabel, formatIndexValue } from "../deviationFormat";

/** Small inline "index card" glyph — distinct from StrategyChartToggle's grid icon. */
function IndexIcon() {
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
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="17" y2="13" />
      <line x1="7" y1="17" x2="13" y2="17" />
    </svg>
  );
}

/**
 * Level 6 — Deviation Reference overlay. Same shape as StrategyChartToggle
 * (self-contained toggle + backdrop + panel, reusing its exact
 * .strategy-chart-* classes for pixel-consistent chrome) but renders a
 * data-driven list from DEVIATIONS instead of a static chart image — there's
 * no image asset for 8 rows of text. Used by both Teacher Mode and Combined
 * Mode.
 */
export function DeviationChartToggle() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="strategy-chart-toggle deviation-chart-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close deviation reference" : "Open deviation reference"}
        aria-pressed={isOpen}
        title="Deviation reference"
      >
        <IndexIcon />
      </button>

      {isOpen && (
        <div
          className="strategy-chart-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Deviation reference"
          onClick={() => setIsOpen(false)}
        >
          <div className="strategy-chart-panel deviation-chart-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="strategy-chart-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close deviation reference"
            >
              ×
            </button>
            <h2 className="deviation-chart-title">Count Deviations</h2>
            <ul className="deviation-chart-list">
              {DEVIATIONS.map((rule) => (
                <li key={rule.id} className="deviation-chart-row">
                  <span className="deviation-chart-label">{rule.label}</span>
                  <span className="deviation-chart-value">
                    {actionLabel(rule.action)} at {formatIndexValue(rule.threshold)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
