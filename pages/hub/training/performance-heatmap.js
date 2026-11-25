import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
};

const BOARD_CARDS_BY_STREET = {
  flop: ['Kc', '4d', '4s'],
  turn: ['Kc', '4d', '4s', '2h'],
  river: ['Kc', '4d', '4s', '2h', '7c'],
};

export default function PerformanceHeatmapRedirect() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [activeStreet, setActiveStreet] = useState('flop');

  useEffect(() => {
    if (router.isReady) router.replace('/hub/training/gto-reports');
  }, [router]);

  const brainEval = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const boardCards = BOARD_CARDS_BY_STREET[activeStreet] || BOARD_CARDS_BY_STREET.flop;
    return evaluateTrainingSpotWithHorseBrain({
      variant: activeVariant,
      street: activeStreet,
      heroCards,
      boardCards,
      heroPosition,
      villainPosition: heroPosition === 'BB' ? 'BTN' : 'BB',
      pot: 6.5,
      toCall: 2.2,
      effectiveStackBb: 100,
    });
  }, [activeVariant, activeStreet, heroPosition]);

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant,
          street: activeStreet,
          position: heroPosition,
        },
        'performance-heatmap',
      ),
    [activeVariant, activeStreet, heroPosition],
  );

  return (
    <>
      <SEOHead
        title="Performance Heatmap - Smarter.Poker"
        description="Open The Verified GTO Reporting Workspace. It Shows Only Dimensions Actually Stored With Your Graded Decisions And Never Invents Position Or Street Results From A Game Name."
        noindex
      />
      <main
        className="sp-training-tool sp-training-tool--analysis"
        style={{
          minHeight: 'calc(100dvh - 70px)',
          padding: 'clamp(30px, 8vw, 90px) 18px',
          background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)',
          color: '#fff',
        }}
      >
        <section
          className="sp-training-analysis-main"
          style={{
            position: 'relative',
            maxWidth: 760,
            margin: '0 auto',
            padding: 'clamp(24px, 5vw, 48px)',
            border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, rgba(9, 23, 39, 0.96) 0%, rgba(3, 11, 20, 0.98) 100%)',
            boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <div
              className="sp-training-analysis-header"
              style={{
                color: '#79e6ff',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Verified Performance Data
            </div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>
              Performance Heatmap
            </h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>
              Open The Verified GTO Reporting Workspace. It Shows Only Dimensions Actually Stored With Your Graded Decisions And Never Invents Position Or Street Results From A Game Name.
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
                    Horse Brain Spot &amp; Mastery Reference Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                    Engine: {brainEval.engineModule} | Recommended: {brainEval.correctAnswerText}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Variant
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={activeVariant === v}
                          onClick={() => setActiveVariant(v)}
                          style={{
                            padding: '6px 12px',
                            border: activeVariant === v ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.16)',
                            background: activeVariant === v ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.04)',
                            color: activeVariant === v ? '#7dd3fc' : '#cbd5e1',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {v.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Position
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['BTN', 'CO', 'SB', 'BB'].map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          aria-pressed={heroPosition === pos}
                          onClick={() => setHeroPosition(pos)}
                          style={{
                            padding: '6px 12px',
                            border: heroPosition === pos ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.16)',
                            background: heroPosition === pos ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                            color: heroPosition === pos ? '#6ee7b7' : '#cbd5e1',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Street
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['flop', 'turn', 'river'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          aria-pressed={activeStreet === st}
                          onClick={() => setActiveStreet(st)}
                          style={{
                            padding: '6px 12px',
                            border: activeStreet === st ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.16)',
                            background: activeStreet === st ? 'rgba(251, 191, 36, 0.18)' : 'rgba(255,255,255,0.04)',
                            color: activeStreet === st ? '#fde68a' : '#cbd5e1',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {st.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {brainEval.explanation}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <button
                    type="button"
                    data-launch-club-arena-cta="true"
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
                    Practice Target Spot In Club Arena →
                  </button>
                  <a
                    href="/hub/training/gto-reports"
                    style={{
                      display: 'inline-flex',
                      minHeight: 40,
                      alignItems: 'center',
                      padding: '0 16px',
                      border: '1px solid #a5efff',
                      background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 900,
                      textDecoration: 'none',
                    }}
                  >
                    Open GTO Reports →
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
