import { Play } from 'lucide-react';

export default function TrainingLobbyHeader({ heroGame, continueTarget, onPlayGame }) {
  const primaryGame = continueTarget?.game || heroGame;
  const actionLabel = continueTarget?.game ? 'Play Again' : 'Quick Play';

  return (
    <section aria-labelledby="hero-h" className="sp-arena-masthead sp-arena-lobby-title sd-masthead" data-tutorial="hero">
      <h1 id="hero-h" className="sp-arena-masthead__title">Training Games</h1>
      <button
        type="button"
        className="sp-arena-quick-play sd-button sd-primary"
        data-start-training-cta="true"
        data-continue-training-cta={continueTarget?.game ? 'true' : undefined}
        disabled={!primaryGame}
        onClick={() => onPlayGame(primaryGame, continueTarget?.preset)}
      >
        <Play size={15} aria-hidden="true" />
        <span>
          <strong>{actionLabel}</strong>
          {primaryGame && <span>{primaryGame.name}</span>}
        </span>
      </button>
    </section>
  );
}
