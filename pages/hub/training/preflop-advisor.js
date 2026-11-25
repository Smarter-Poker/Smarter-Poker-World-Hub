import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const VERIFIED_DRILL = '/hub/training/arena/cash-001?level=1&source=preflop-advisor';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Ks'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
};

const VARIANTS = ['nlh', 'plo4', 'plo5', 'plo6', 'plo8'];
const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STACK_DEPTHS = [20, 40, 100];

const pillButtonStyle = (active) => ({
  padding: '6px 12px',
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

export default function PreflopAdvisorPage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [effectiveStackBb, setEffectiveStackBb] = useState(100);

  const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;

  const brainEval = useMemo(() => {
    return evaluateTrainingSpotWithHorseBrain({
      variant: activeVariant,
      street: 'preflop',
      heroCards,
      boardCards: [],
      heroPosition,
      villainPosition: heroPosition === 'BB' ? 'BTN' : 'BB',
      pot: 1.5,
      toCall: 1,
      effectiveStackBb,
    });
  }, [activeVariant, heroCards, heroPosition, effectiveStackBb]);

  const arenaHref = useMemo(() => {
    return buildCustomTrainingArenaHref(
      {
        gameId: activeVariant === 'nlh' ? 'cash-001' : 'cash-005',
        variant: activeVariant,
        street: 'preflop',
        position: heroPosition,
      },
      'preflop-advisor',
    );
  }, [activeVariant, heroPosition]);

  return (
    <>
      <SEOHead
        title="Preflop Blueprint - Smarter.Poker"
        description="Opening The Authored Preflop Blueprint Curriculum On The Club Arena Table With Four Contextual Actions And Verified Persistence."
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
              Verified Club Arena Drill
            </div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>
              Preflop Blueprint
            </h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>
              Opening The Authored Preflop Blueprint Curriculum On The Club Arena Table With Four Contextual Actions And Verified Persistence.
            </p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-active-variant={activeVariant}
                data-hero-position={heroPosition}
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 12,
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  background: 'rgba(2, 6, 23, 0.72)',
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
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#79e6ff', textTransform: 'uppercase' }}>
                    Horse Brain Range &amp; Preflop Calibration Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>
                    {`Engine: ${brainEval.engineModule} | Recommended: ${brainEval.correctAnswerText}`}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Variant
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {VARIANTS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          data-variant-option={v}
                          aria-pressed={activeVariant === v}
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
                      Hero Position
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {POSITIONS.map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          data-position-option={pos}
                          aria-pressed={heroPosition === pos}
                          onClick={() => setHeroPosition(pos)}
                          style={pillButtonStyle(heroPosition === pos)}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Stack Depth
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {STACK_DEPTHS.map((stk) => (
                        <button
                          key={stk}
                          type="button"
                          data-stack-option={stk}
                          aria-pressed={effectiveStackBb === stk}
                          onClick={() => setEffectiveStackBb(stk)}
                          style={pillButtonStyle(effectiveStackBb === stk)}
                        >
                          {stk} BB
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 800, color: '#6ee7b7' }}>
                  {`Recommended Action: ${brainEval.correctAnswerText} (${brainEval.correctAnswer}) | Hand Score: ${brainEval.handScore}/100`}
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {brainEval.explanation}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <button
                    type="button"
                    data-launch-club-arena-cta="true"
                    data-launch-href={arenaHref}
                    onClick={() => router.push(arenaHref)}
                    style={{
                      padding: '10px 16px',
                      border: '1px solid #38bdf8',
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Practice Preflop Spot In Club Arena →
                  </button>
                  <a
                    href={VERIFIED_DRILL}
                    style={{
                      display: 'inline-flex',
                      minHeight: 40,
                      alignItems: 'center',
                      padding: '0 16px',
                      border: '1px solid #a5efff',
                      background: 'linear-gradient(180deg, #2a6077, #07131d)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 900,
                      textDecoration: 'none',
                    }}
                  >
                    Continue To Preflop Blueprint →
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
