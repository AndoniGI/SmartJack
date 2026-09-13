import Link from "next/link";
import "./count-deviations.css";

export default function CountDeviationsPage() {
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

        <section className="count-deviations-intro" aria-live="polite">
          <p className="count-deviations-eyebrow">Level 6</p>
          <h1 className="training-title">Count Deviations</h1>
          <p className="count-deviations-description">
            Learn when the true count changes the mathematically correct play, then practice applying
            it silently during live hands.
          </p>

          <div className="count-deviations-mode-grid">
            <Link href="/training/count-deviations/teacher" className="count-deviations-mode-card">
              <h2>Deviation Teacher</h2>
              <p>
                Drill the 8 starter deviations one at a time: a hand, a dealer upcard, and a stated true
                count. See exactly how basic strategy and the deviation compare on every rep.
              </p>
            </Link>

            <Link href="/training/count-deviations/combined" className="count-deviations-mode-card">
              <h2>Combined Live Mode</h2>
              <p>
                Full hands from a persistent shoe, same as Level 5&apos;s table. Deviations are applied
                silently in the answer key — the count is never shown, only graded.
              </p>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
