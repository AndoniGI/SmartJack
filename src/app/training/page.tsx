import Link from "next/link";

const levels = [
  {
    id: 1,
    title: "Card Values",
    description:
      "Learn to instantly recognise which cards are +1, 0, or −1 using the Hi-Lo system.",
    active: true,
    locked: false,
    badge: "Active",
    skill: "Recognition",
  },
  {
    id: 2,
    title: "Running Count",
    description: "Keep a live count as cards are dealt.",
    active: false,
    locked: true,
    badge: "Locked",
    skill: "Tracking",
  },
  {
    id: 3,
    title: "Basic Strategy",
    description: "Practice choosing Hit, Stand, Double, or Split.",
    active: false,
    locked: true,
    badge: "Locked",
    skill: "Decision Making",
  },
  {
    id: 4,
    title: "True Count",
    description: "Convert the running count using decks remaining.",
    active: false,
    locked: true,
    badge: "Locked",
    skill: "Conversion",
  },
  {
    id: 5,
    title: "Count Deviations",
    description: "Learn when the count changes the mathematically correct play.",
    active: false,
    locked: true,
    badge: "Locked",
    skill: "Advanced Play",
  },
];

export default function TrainingPage() {
  return (
    <main className="training-page">
      <div className="training-shell">
        <header className="training-header">
          <Link href="/" className="training-brand" aria-label="SmartJack home">
            SmartJack
          </Link>

          <nav className="training-nav" aria-label="Main navigation">
            <a href="#learn">Learn</a>
            <a href="#practice">Practice</a>
            <a href="#about">About</a>
          </nav>
        </header>

        <section className="training-content" aria-labelledby="training-title">
          <h1 id="training-title" className="training-title">
            Training
          </h1>
          <p className="training-subtitle">Build your counting skills step by step.</p>

          <div className="level-grid">
            {levels.map((level) => (
              <article
                key={level.id}
                className={`level-card ${level.active ? "active" : ""} ${level.locked ? "locked" : ""}`}
                aria-label={`${level.title} level ${level.locked ? "locked" : "available"}`}
              >
                <span className={`level-marker ${level.active ? "active" : ""}`} aria-hidden="true" />

                <div className="level-main">
                  <div className="level-heading">
                    <h2 className="level-name">Level {level.id} — {level.title}</h2>
                    {!level.locked && <span className="level-badge">{level.badge}</span>}
                  </div>
                  <span className="level-skill">{level.skill}</span>
                  <p className="level-copy">{level.description}</p>
                </div>

                <div className="level-actions">
                  {level.locked ? (
                    <span className="lock-icon" aria-label="Locked level">
                      🔒
                    </span>
                  ) : (
                    <Link href={level.id === 1 ? "/training/card-values" : "/training"} className="level-button">
                      Start Level
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
