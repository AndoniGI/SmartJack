export default function Home() {
  return (
    <main className="hero-page" aria-label="SmartJack landing page hero section">
      <div className="hero-shell">
        <header className="hero-header">
          <div className="brand" aria-label="SmartJack home">
            <span className="brand-mark">SmartJack</span>
          </div>

          <nav className="main-nav" aria-label="Main navigation">
            <a href="#learn">Learn</a>
            <a href="#practice">Practice</a>
            <a href="#about">About</a>
          </nav>
        </header>

        <section className="hero-content">
          <p className="eyebrow">BLACKJACK CARD COUNTING</p>

          <h1 className="headline" aria-label="Master the Count, Play Smarter">
            <span className="headline-line">Master the Count.</span>
            <span className="headline-line accent">Play Smarter.</span>
          </h1>

          <p className="supporting-copy">
            Learn the system. Train your speed. Test your accuracy.
          </p>

          <div className="cta-stack">
            <button type="button" className="btn-primary">
              START TRAINING
            </button>
            <button type="button" className="btn-secondary">
              HOW IT WORKS
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
