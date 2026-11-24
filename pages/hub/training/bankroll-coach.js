import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
};

const BOARD_CARDS = ['Qs', '7d', '2c'];

const pillButtonStyle = (active) => ({
  padding: '7px 12px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  border: active ? '1px solid #67e8f9' : '1px solid rgba(255,255,255,0.16)',
  background: active
    ? 'linear-gradient(180deg, rgba(8,145,178,0.75), rgba(3,50,74,0.92))'
    : 'rgba(255,255,255,0.05)',
  color: active ? '#e8fbff' : '#cbd5e1',
});

/**
 * The retired page converted Training accuracy and partially priced decisions
 * into guaranteed hourly and monthly bankroll savings. Those projections did
 * not have enough evidence to be product truth. Preserve the route, surface
 * the live Horse Brain Session & Mindset Coaching Panel, and send the player
 * to the sealed-attempt report that owns the actual measurements.
 */
export default function BankrollCoachPage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [effectiveStackBb, setEffectiveStackBb] = useState(100);

  const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
  const boardCards = BOARD_CARDS;

  const brainEval = useMemo(
    () =>
      evaluateTrainingSpotWithHorseBrain({
        variant: activeVariant,
        street: 'flop',
        heroCards,
        boardCards,
        pot: 6.5,
        toCall: 2.2,
        effectiveStackBb,
      }),
    [activeVariant, heroCards, boardCards, effectiveStackBb]
  );

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        { gameId: activeVariant === 'nlh' ? 'psy-001' : 'cash-005', variant: activeVariant },
        'bankroll-coach'
      ),
    [activeVariant]
  );

  return (
    <>
      <SEOHead
        title="Bankroll Coach - Smarter.Poker"
        description="Opening Your Verified Training Report. Unsupported Dollar-Per-Hour And Monthly Savings Projections Have Been Retired; Only Server-Recorded Decisions And Measured EV Evidence Are Shown."
        noindex
      />
      <main
        style={{
          minHeight: 'calc(100dvh - 70px)',
          padding: 'clamp(30px, 8vw, 90px) 18px',
          background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)',
          color: '#fff',
        }}
      >
        <section
          style={{
            position: 'relative',
            maxWidth: 760,
            margin: '0 auto',
            padding: 'clamp(24px, 5vw, 48px)',
            border: '1px solid rgba(145,229,255,.45)',
            background: 'linear-gradient(145deg, rgba(20,42,60,.97), rgba(4,9,15,.98))',
            boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <div
              style={{
                color: '#79e6ff',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Verified Training History
            </div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>
              Bankroll Coach
            </h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>
              Opening Your Verified Training Report. Unsupported Dollar-Per-Hour And Monthly Savings Projections Have Been Retired; Only Server-Recorded Decisions And Measured EV Evidence Are Shown.
            </p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-active-variant={activeVariant}
                style={{
                  marginTop: 24,
                  padding: 18,
                  borderRadius: 12,
                  border: '1px solid rgba(56,189,248,0.40)',
                  background: 'rgba(15,23,42,0.82)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#67e8f9', textTransform: 'uppercase' }}>
                    Horse Brain Session &amp; Mindset Coaching Panel
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                    {`Engine: ${brainEval.engineModule} · Recommended: ${brainEval.correctAnswerText}`}
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Variant
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          data-variant-option={v}
                          onClick={() => setActiveVariant(v)}
                          style={pillButtonStyle(activeVariant === v)}
                        >
                          {v.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Risk / Stack Profile
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {[20, 40, 100, 200].map((stk) => (
                        <button
                          key={stk}
                          type="button"
                          data-stack-option={stk}
                          onClick={() => setEffectiveStackBb(stk)}
                          style={pillButtonStyle(effectiveStackBb === stk)}
                        >
                          {stk} BB
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 14 }}>
                  {brainEval.explanation}
                </div>

                <button
                  type="button"
                  data-launch-club-arena-cta="true"
                  data-launch-href={arenaHref}
                  onClick={() => router.push(arenaHref)}
                  style={{
                    display: 'inline-flex',
                    minHeight: 44,
                    alignItems: 'center',
                    padding: '0 18px',
                    borderRadius: 8,
                    border: '1px solid #67e8f9',
                    background: 'linear-gradient(180deg, #0891b2, #075985)',
                    color: '#fff',
                    fontWeight: 900,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Launch Calibrated Drill In Club Arena →
                </button>
              </div>
            )}

            <a
              href="/hub/training/gto-reports?source=bankroll-coach"
              style={{
                display: 'inline-flex',
                minHeight: 48,
                alignItems: 'center',
                padding: '0 20px',
                marginTop: 24,
                border: '1px solid #a5efff',
                background: 'linear-gradient(180deg, #2a6077, #07131d)',
                color: '#fff',
                fontWeight: 900,
                textDecoration: 'none',
              }}
            >
              Open Verified Training Report →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
