import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const CANONICAL_ARENA_HREF = '/hub/training/arena/adv-011?level=1&source=pot-geometry';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
};

const BOARD_CARDS = ['Kc', '9d', '4s'];

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

export default function PotGeometryPage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [stackDepthBb, setStackDepthBb] = useState(100);
  const [potBb, setPotBb] = useState(12);
  const [facingBetBb, setFacingBetBb] = useState(4);

  const geometryEval = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const spr = Math.round((stackDepthBb / potBb) * 100) / 100;
    const potOddsPct = facingBetBb > 0
      ? Math.round((facingBetBb / (potBb + 2 * facingBetBb)) * 1000) / 10
      : 0;
    const mdfPct = facingBetBb > 0
      ? Math.round((potBb / (potBb + facingBetBb)) * 1000) / 10
      : 100;
    const brainEval = evaluateTrainingSpotWithHorseBrain({
      variant: activeVariant,
      heroCards,
      boardCards: BOARD_CARDS,
      street: 'flop',
      pot: potBb,
      toCall: facingBetBb,
      effectiveStackBb: stackDepthBb,
      heroPosition: 'BTN',
      villainPosition: 'BB',
    });
    const potLimitMaxBetBb = brainEval?.brainEvaluation?.potLimitMaxBetBb
      ?? brainEval?.potLimitSizing?.maxPotBetOrRaise
      ?? Number((potBb + 2 * facingBetBb).toFixed(2));
    const arenaHref = buildCustomTrainingArenaHref(
      { gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005', variant: activeVariant },
      'pot-geometry',
    );
    return {
      spr,
      potOddsPct,
      mdfPct,
      potLimitMaxBetBb,
      brainEval,
      arenaHref,
    };
  }, [activeVariant, stackDepthBb, potBb, facingBetBb]);

  return (
    <>
      <SEOHead
        title="SPR Mastery - Smarter.Poker"
        description="Opening The Authored Stack-To-Pot Curriculum On The Club Arena Table With Validated Questions, Four Contextual Answers, And Persistent Grading."
        noindex
      />
      <UniversalHeader pageDepth={2} />
      <main
        style={{
          minHeight: 'calc(100dvh - 70px)',
          padding: 'clamp(24px, 6vw, 64px) 18px',
          background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)',
          color: '#fff',
        }}
      >
        <section
          style={{
            position: 'relative',
            maxWidth: 820,
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
              SPR Mastery &amp; Pot Geometry
            </h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>
              Opening The Authored Stack-To-Pot Curriculum On The Club Arena Table With Validated Questions, Four Contextual Answers, And Persistent Grading.
            </p>

            <div
              data-specialty-brain-panel="true"
              data-brain-engine={geometryEval.brainEval.engineModule}
              data-recommended-action={geometryEval.brainEval.correctAnswer}
              data-geometry-spr={geometryEval.spr}
              data-geometry-mdf={geometryEval.mdfPct}
              data-geometry-pot-odds={geometryEval.potOddsPct}
              data-pot-limit-max-bet-bb={geometryEval.potLimitMaxBetBb}
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
                  Horse Brain Postflop Geometry &amp; SPR Panel
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                  {`Engine: ${geometryEval.brainEval.engineModule} · Recommended: ${geometryEval.brainEval.correctAnswerText}`}
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
                    Stack Depth
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[20, 50, 100, 200].map((stk) => (
                      <button
                        key={stk}
                        type="button"
                        data-stack-option={stk}
                        onClick={() => setStackDepthBb(stk)}
                        style={pillButtonStyle(stackDepthBb === stk)}
                      >
                        {stk} BB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                    Pot Size
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[6, 12, 24].map((p) => (
                      <button
                        key={p}
                        type="button"
                        data-pot-option={p}
                        onClick={() => setPotBb(p)}
                        style={pillButtonStyle(potBb === p)}
                      >
                        {p} BB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                    Facing Bet Size
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[2, 4, 9, 18].map((bet) => (
                      <button
                        key={bet}
                        type="button"
                        data-facing-bet-option={bet}
                        onClick={() => setFacingBetBb(bet)}
                        style={pillButtonStyle(facingBetBb === bet)}
                      >
                        {bet} BB
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>SPR</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc' }}>{geometryEval.spr}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Pot Odds %</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#fbbf24' }}>{geometryEval.potOddsPct}%</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>MDF %</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#38bdf8' }}>{geometryEval.mdfPct}%</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Pot-Limit Max Bet</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#c084fc' }}>
                    {geometryEval.potLimitMaxBetBb} BB
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Recommended Action</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#4ade80' }}>
                    {geometryEval.brainEval.correctAnswerText}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>
                {geometryEval.brainEval.explanation}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 22 }}>
              <button
                type="button"
                data-launch-club-arena-cta="true"
                data-launch-href={geometryEval.arenaHref}
                onClick={() => router.push(geometryEval.arenaHref)}
                style={{
                  display: 'inline-flex',
                  minHeight: 48,
                  alignItems: 'center',
                  padding: '0 20px',
                  border: '1px solid #67e8f9',
                  background: 'linear-gradient(180deg, #0891b2, #075985)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Practice Geometry Spot In Club Arena →
              </button>

              <a
                href={CANONICAL_ARENA_HREF}
                style={{
                  display: 'inline-flex',
                  minHeight: 48,
                  alignItems: 'center',
                  padding: '0 20px',
                  border: '1px solid #a5efff',
                  background: 'linear-gradient(180deg, #2a6077, #07131d)',
                  color: '#fff',
                  fontWeight: 900,
                  textDecoration: 'none',
                  fontSize: 14,
                }}
              >
                Continue To SPR Mastery →
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
