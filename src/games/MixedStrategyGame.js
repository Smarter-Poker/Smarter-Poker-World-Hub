import React from 'react';
import { ArrowLeft, ArrowRight, Dices } from 'lucide-react';
import { GameFrame } from '../components/memory-games/PreflopGameKit';

const VERIFIED_MIXED_STRATEGY_ROUTE =
  '/hub/training/mixed-strategy-lab?source=preflop-charts';

/**
 * The former mini-game mixed audited chart rows with hand-authored percentage
 * guesses, then graded both as exact solver frequencies. Keep the menu entry,
 * but hand authority to the signed Training Arena instead.
 */
export default function MixedStrategyGame({ onExit }) {
  const openVerifiedTrainer = () => {
    if (typeof window !== 'undefined') {
      window.location.assign(VERIFIED_MIXED_STRATEGY_ROUTE);
    }
  };

  return (
    <GameFrame>
      <section className="preflop-sd-surface" aria-labelledby="verified-mixed-strategy-title">
        <div className="preflop-sd-emblem" aria-hidden="true">
          <Dices size={40} strokeWidth={1.8} />
        </div>
        <div className="preflop-sd-kicker">Verified Training Transfer</div>
        <h1 id="verified-mixed-strategy-title" className="preflop-sd-title">
          Mixed Strategy Lab
        </h1>
        <p className="preflop-sd-copy">
          Exact-Frequency Decisions Require A Sealed Solver Source. Continue In The Verified Training Arena For Server-Delivered Questions, Grading, Feedback, And Progress.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <button type="button" className="preflop-sd-primary" onClick={openVerifiedTrainer}>
            Open Verified Mixed Strategy Training <ArrowRight size={18} aria-hidden />
          </button>
          <button type="button" className="preflop-sd-button" onClick={onExit}>
            <ArrowLeft size={17} aria-hidden /> Return To Preflop Charts
          </button>
        </div>
      </section>
    </GameFrame>
  );
}
