import Link from 'next/link';
import { useState } from 'react';
import { Play, X } from 'lucide-react';
import TrainingLobbyDialog from './TrainingLobbyDialog';
import styles from './TrainingLobby.module.css';

export default function TrainingLobbyHeader({
  heroGame,
  continueTarget,
  onPlayGame,
  jarvisImageSrc = '/images/jarvis-avatar.webp',
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const primaryGame = continueTarget?.game || heroGame;
  const actionLabel = continueTarget?.game ? 'Play Again' : 'Quick Play';

  return (
    <section aria-labelledby="hero-h" className={styles.lobbyHeader} data-tutorial="hero">
      <div className={styles.titleBar}>
        <h1 id="hero-h">Training Games</h1>
        <button
          type="button"
          className={`${styles.chromeButton} ${styles.helpButton}`}
          aria-label="Training Games Help"
          aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}
        >?</button>
      </div>
      <div className={styles.launchActions}>
        <button
          type="button"
          className={`${styles.chromeButton} ${styles.primaryButton} ${styles.quickPlay}`}
          data-start-training-cta="true"
          data-continue-training-cta={continueTarget?.game ? 'true' : undefined}
          disabled={!primaryGame}
          title={primaryGame?.name}
          onClick={() => onPlayGame(primaryGame, continueTarget?.preset)}
        >
          <Play aria-hidden="true" /><span>{actionLabel}</span>
        </button>
        <Link
          href="/hub/personal-assistant/leaks?source=training-home"
          className={`${styles.chromeButton} ${styles.assistantAction}`}
          data-personal-assistant-leaks="true"
        >
          {/* Existing assistant destination only; new recommendation wiring is separate. */}
          <span className={styles.jarvisPortrait} aria-hidden="true">
            <img src={jarvisImageSrc} width={1024} height={680} alt="" />
          </span>
          <span className={styles.assistantCopy}>
            <strong>Fix My Top Leaks</strong><span>Personal Assistant</span>
          </span>
        </Link>
      </div>
      <TrainingLobbyDialog open={helpOpen} onClose={() => setHelpOpen(false)} labelledBy="training-help-title" data-training-help="true">
        <header className={styles.dialogHeader}>
          <h2 id="training-help-title">Training Games Help</h2>
          <button type="button" className={`${styles.chromeButton} ${styles.iconButton}`} aria-label="Close Training Help" onClick={() => setHelpOpen(false)}><X size={21} aria-hidden="true" /></button>
        </header>
        <div className={`${styles.dialogBody} ${styles.helpContent}`}>
          <h3>Find Your Game</h3>
          <p>Choose Cash Games, Tournaments, Strategy, Mental Games, Or Spins. Search By A Game Name Or Poker Topic, Then Use Filters To Choose A Variant, Level, Or Training Style.</p>
          <h3>Play Or Configure</h3>
          <p>Tap Play To Start A Game With Its Preset. Configure Opens The Available Poker Variant And Street Focus Before You Begin. The Star Saves A Game To Favorites.</p>
          <h3>Explore The Shelves</h3>
          <p>Swipe A Shelf Or Use Its Arrows To Browse More Games. View All Opens That Collection. The Grid And List Buttons Change How Matching Games Are Displayed.</p>
          <h3>Practice And Review</h3>
          <p>10-Hand Warmup Starts A Short Session. History Shows Previous Sessions. Fix My Top Leaks Opens Your Personal Assistant Leak Finder.</p>
        </div>
        <footer className={styles.dialogFooter}>
          <button type="button" className={`${styles.chromeButton} ${styles.primaryButton}`} onClick={() => setHelpOpen(false)}>Got It</button>
        </footer>
      </TrainingLobbyDialog>
    </section>
  );
}
