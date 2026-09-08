import React from 'react';

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
    <section
      aria-labelledby="verified-mixed-strategy-title"
      style={{
        maxWidth: 620,
        margin: '32px auto',
        padding: 24,
        color: '#eefaff',
        background: 'linear-gradient(155deg, rgba(20, 34, 50, 0.98), rgba(3, 10, 18, 0.99))',
        border: '1px solid rgba(112, 224, 255, 0.48)',
        borderRadius: 12,
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.5), inset 0 1px rgba(255, 255, 255, 0.08)',
      }}
    >
      <div style={{ color: '#79ddff', fontSize: 11, letterSpacing: '0.18em' }}>
        Verified Training Transfer
      </div>
      <h1 id="verified-mixed-strategy-title" style={{ margin: '8px 0 10px', fontSize: 28 }}>
        Mixed Strategy Lab
      </h1>
      <p style={{ margin: '0 0 20px', color: 'rgba(238, 250, 255, 0.76)', lineHeight: 1.6 }}>
        Exact-Frequency Decisions Require A Sealed Solver Source. Continue In The Verified Training Arena For Server-Delivered Questions, Grading, Feedback, And Progress.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <button
          type="button"
          onClick={openVerifiedTrainer}
          style={{
            padding: '13px 16px', border: '1px solid #9beaff', borderRadius: 8,
            background: 'linear-gradient(180deg, #55d6ff, #087fa9)', color: '#031018',
            fontWeight: 800, cursor: 'pointer',
          }}
        >
          Open Verified Mixed Strategy Training
        </button>
        <button
          type="button"
          onClick={onExit}
          style={{
            padding: '11px 16px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', color: '#d8eff8', cursor: 'pointer',
          }}
        >
          Return To Preflop Charts
        </button>
      </div>
    </section>
  );
}
