import { Play } from 'lucide-react';
import TrainingImageHeader from '../TrainingImageHeader';

export default function TrainingLobbyHeader({ heroGame, continueTarget, fiveMinuteLeakFix, onPlayGame }) {
  const primaryGame = continueTarget?.game || heroGame;
  const actionLabel = continueTarget?.game ? 'Play Again' : 'Quick Play';
  const leakFixGame = fiveMinuteLeakFix?.game || null;
  const hasDetectedLeakFix = Boolean(leakFixGame && fiveMinuteLeakFix?.basis && fiveMinuteLeakFix.basis !== 'daily-warmup');

  return (
    <section aria-labelledby="hero-h" className="sp-arena-lobby-title" data-tutorial="hero">
      <TrainingImageHeader slug="training-lobby" title="Training Games" titleId="hero-h">
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {hasDetectedLeakFix && (
          <button
            type="button"
            className="sd-button"
            data-top-detected-leak-cta="true"
            data-leak-basis={fiveMinuteLeakFix.basis}
            onClick={() => onPlayGame(leakFixGame, fiveMinuteLeakFix.overrides)}
            >
            <span>Fix Top Leak (10 Hands)</span>
          </button>
        )}
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
      </div>
      </TrainingImageHeader>
    </section>
  );
}
