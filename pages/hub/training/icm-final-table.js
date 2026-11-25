import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

export default function IcmFinalTablePage() {
  const router = useRouter();
  const [heroStackBb, setHeroStackBb] = useState(22);
  const [firstPrizePct, setFirstPrizePct] = useState(35);
  const [minCashPct, setMinCashPct] = useState(8);
  const [toCallBb, setToCallBb] = useState(14);
  const [brainVariant, setBrainVariant] = useState('nlh');

  const dynamicBubbleFactor = useMemo(() => {
    const baseBf = heroStackBb <= 15 ? 1.95 : heroStackBb <= 28 ? 1.68 : 1.38;
    const payoutSkew = (40 - firstPrizePct) * 0.012 + (minCashPct - 5) * 0.025;
    return Number(Math.max(1.1, Math.min(2.6, baseBf + payoutSkew)).toFixed(2));
  }, [heroStackBb, firstPrizePct, minCashPct]);

  const arenaHref = useMemo(
    () => buildCustomTrainingArenaHref({ gameId: 'mtt-004', variant: brainVariant }, 'icm-final-table'),
    [brainVariant]
  );

  const brainEval = useMemo(() => {
    try {
      const heroCardsByVariant = {
        nlh: ['Ah', 'Js'],
        plo4: ['As', 'Ks', 'Qh', 'Jh'],
        plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
        plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
        plo8: ['As', '2s', 'Kd', '3d'],
      };
      return evaluateTrainingSpotWithHorseBrain({
        gameId: 'mtt-004',
        variant: brainVariant,
        street: 'preflop',
        heroCards: heroCardsByVariant[brainVariant] || heroCardsByVariant.nlh,
        boardCards: [],
        heroPosition: 'CO',
        villainPosition: 'BTN',
        pot: 2.5,
        toCall: toCallBb,
        effectiveStackBb: heroStackBb,
        isICM: true,
        isPKO: false,
        bubbleFactor: dynamicBubbleFactor,
        payoutPressure: `Final Table (1st ${firstPrizePct}%, Min ${minCashPct}%, BF ${dynamicBubbleFactor}x)`,
      });
    } catch {
      return null;
    }
  }, [heroStackBb, firstPrizePct, minCashPct, toCallBb, dynamicBubbleFactor, brainVariant]);

  return (
    <>
      <SEOHead
        title="Final Table ICM - Smarter.Poker"
        description="Opening The Authored Final Table ICM Game. Viewing A Scenario No Longer Counts As A Correct Answer Or A Completed Session."
        noindex
      />
      <main
        style={{
          minHeight: 'calc(100dvh - 70px)',
          padding: 'clamp(30px, 8vw, 90px) 18px',
          background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)',
          color: '#fff',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <section
          style={{
            position: 'relative',
            maxWidth: 780,
            margin: '0 auto',
            padding: 'clamp(24px, 5vw, 44px)',
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
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.05 }}>
              Final Table ICM
            </h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>
              Model Final Table Payout Pressure, Pay-Jump Risk Premiums, And Bubble Factors With Horse Brain Before Entering The Authored Club Arena Curriculum.
            </p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-bubble-factor={String(dynamicBubbleFactor)}
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 12,
                  border: '1px solid rgba(121, 230, 255, 0.35)',
                  background: 'rgba(4, 12, 22, 0.85)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#79e6ff' }}>
                    Horse Brain Tournament &amp; ICM/PKO Engine Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                    Engine: {brainEval.engineModule} | BF: {dynamicBubbleFactor}x | Recommended: {brainEval.recommendedAction}
                  </span>
                </div>

                <div data-variant-selector="true" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      data-variant-option={v}
                      onClick={() => setBrainVariant(v)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                        border: brainVariant === v ? '1px solid #79e6ff' : '1px solid rgba(255,255,255,0.14)',
                        background: brainVariant === v ? 'rgba(121, 230, 255, 0.2)' : 'rgba(255,255,255,0.04)',
                        color: brainVariant === v ? '#e0f2fe' : '#b7c9d7',
                      }}
                    >
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <label
                      htmlFor="ft-hero-stack-bb"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      Hero Effective Stack (BB)
                    </label>
                    <input
                      id="ft-hero-stack-bb"
                      aria-label="Hero Effective Stack In Big Blinds"
                      type="number"
                      min="5"
                      max="120"
                      step="1"
                      value={heroStackBb}
                      onChange={(e) => setHeroStackBb(Math.max(5, Number(e.target.value) || 5))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid rgba(121,230,255,0.3)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ft-first-prize-pct"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      1st Place Payout (%)
                    </label>
                    <input
                      id="ft-first-prize-pct"
                      aria-label="First Place Payout Percentage"
                      type="number"
                      min="15"
                      max="70"
                      step="1"
                      value={firstPrizePct}
                      onChange={(e) => setFirstPrizePct(Math.max(15, Number(e.target.value) || 15))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid rgba(121,230,255,0.3)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ft-min-cash-pct"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      Next Pay Jump / Min (%)
                    </label>
                    <input
                      id="ft-min-cash-pct"
                      aria-label="Minimum Final Table Payout Percentage"
                      type="number"
                      min="1"
                      max="25"
                      step="1"
                      value={minCashPct}
                      onChange={(e) => setMinCashPct(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid rgba(121,230,255,0.3)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ft-tocall-bb"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      Facing Bet / Shove (BB)
                    </label>
                    <input
                      id="ft-tocall-bb"
                      aria-label="Facing Bet Or Shove In Big Blinds"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={toCallBb}
                      onChange={(e) => setToCallBb(Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid rgba(121,230,255,0.3)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>

                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#b7c9d7', lineHeight: 1.55 }}>
                  {brainEval.explanation}
                </p>

                <button
                  type="button"
                  data-launch-club-arena-cta="true"
                  onClick={() => router.push(arenaHref)}
                  style={{
                    display: 'inline-flex',
                    minHeight: 44,
                    alignItems: 'center',
                    padding: '0 18px',
                    borderRadius: 8,
                    border: '1px solid #a5efff',
                    background: 'linear-gradient(180deg, #2a6077, #07131d)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Practice Tournament Spot In Club Arena →
                </button>
              </div>
            )}

            <a
              href={arenaHref || '/hub/training/arena/mtt-004?level=1&source=icm-final-table'}
              style={{
                display: 'inline-flex',
                minHeight: 48,
                alignItems: 'center',
                padding: '0 20px',
                marginTop: 20,
                border: '1px solid #a5efff',
                background: 'linear-gradient(180deg, #2a6077, #07131d)',
                color: '#fff',
                fontWeight: 900,
                textDecoration: 'none',
              }}
            >
              Continue To Final Table ICM →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
