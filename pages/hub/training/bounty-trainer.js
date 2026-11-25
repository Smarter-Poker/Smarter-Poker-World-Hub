import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

export default function BountyTrainerPage() {
  const router = useRouter();
  const [bountyBb, setBountyBb] = useState(8);
  const [effectiveStackBb, setEffectiveStackBb] = useState(25);
  const [potBb, setPotBb] = useState(6.5);
  const [toCallBb, setToCallBb] = useState(12);
  const [bubbleFactor, setBubbleFactor] = useState(1.25);
  const [brainVariant, setBrainVariant] = useState('nlh');

  const arenaHref = useMemo(
    () => buildCustomTrainingArenaHref({ gameId: 'mtt-005', variant: brainVariant }, 'bounty-trainer'),
    [brainVariant]
  );

  const brainEval = useMemo(() => {
    try {
      const heroCardsByVariant = {
        nlh: ['Ad', 'Ts'],
        plo4: ['As', 'Ks', 'Qh', 'Jh'],
        plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
        plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
        plo8: ['As', '2s', 'Kd', '3d'],
      };
      return evaluateTrainingSpotWithHorseBrain({
        gameId: 'mtt-005',
        variant: brainVariant,
        street: 'preflop',
        heroCards: heroCardsByVariant[brainVariant] || heroCardsByVariant.nlh,
        boardCards: [],
        heroPosition: 'BTN',
        villainPosition: 'BB',
        pot: potBb,
        toCall: toCallBb,
        effectiveStackBb,
        isICM: true,
        isPKO: true,
        bountyBb,
        bubbleFactor,
      });
    } catch {
      return null;
    }
  }, [bountyBb, effectiveStackBb, potBb, toCallBb, bubbleFactor, brainVariant]);

  const pkoAdj = brainEval?.brainEvaluation?.pkoBountyAdjustment;

  return (
    <>
      <SEOHead
        title="PKO Bounty Hunter - Smarter.Poker"
        description="Opening The Authored Bounty-Math Curriculum With Club Arena Gameplay, Four Contextual Actions, Explicit Feedback, And Manual Next Progression."
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
              PKO Bounty Hunter
            </h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>
              Analyze Progressive Knockout Bounty Chip Equivalence And Calling Threshold Discounts Before Launching The Authored Club Arena Curriculum.
            </p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-bubble-factor={String(bubbleFactor)}
                data-bounty-bb={String(bountyBb)}
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
                    Engine: {brainEval.engineModule} | Recommended: {brainEval.recommendedAction}
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
                      htmlFor="pko-bounty-bb-input"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      Visible Bounty (BB)
                    </label>
                    <input
                      id="pko-bounty-bb-input"
                      aria-label="Visible Bounty In Big Blinds"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={bountyBb}
                      onChange={(e) => setBountyBb(Math.max(1, Number(e.target.value) || 1))}
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
                      htmlFor="pko-stack-bb-input"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      Effective Stack (BB)
                    </label>
                    <input
                      id="pko-stack-bb-input"
                      aria-label="Effective Stack In Big Blinds"
                      type="number"
                      min="5"
                      max="150"
                      step="1"
                      value={effectiveStackBb}
                      onChange={(e) => setEffectiveStackBb(Math.max(5, Number(e.target.value) || 5))}
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
                      htmlFor="pko-tocall-bb-input"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      Facing Shove (BB)
                    </label>
                    <input
                      id="pko-tocall-bb-input"
                      aria-label="Facing Shove Amount In Big Blinds"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={toCallBb}
                      onChange={(e) => setToCallBb(Math.max(1, Number(e.target.value) || 1))}
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
                      htmlFor="pko-bubble-factor-input"
                      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#b7c9d7', marginBottom: 4 }}
                    >
                      ICM Bubble Factor
                    </label>
                    <input
                      id="pko-bubble-factor-input"
                      aria-label="ICM Bubble Factor"
                      type="number"
                      min="1.0"
                      max="3.0"
                      step="0.05"
                      value={bubbleFactor}
                      onChange={(e) => setBubbleFactor(Math.max(1, Number(e.target.value) || 1))}
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

                {pkoAdj && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      padding: '10px 12px',
                      marginBottom: 12,
                      borderRadius: 8,
                      background: 'rgba(121, 230, 255, 0.08)',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#a5efff',
                    }}
                  >
                    <span>Bounty Chip Eq: +{pkoAdj.bountyChipEquivalenceBb} BB</span>
                    <span>Equity Discount: -{pkoAdj.effectivePotOddsDiscountPct}%</span>
                    <span>Hand Score: {brainEval.handScore}/100</span>
                  </div>
                )}

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
              href={arenaHref || '/hub/training/arena/mtt-005?level=1&source=bounty-trainer'}
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
              Continue To Bounty Training →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
