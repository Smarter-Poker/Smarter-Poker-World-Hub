import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const CANONICAL_MIXED_ARENA_HREF = '/hub/training/arena/mixed-strategy-lab?level=1&source=mixed-strategy-lab';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['Ah', 'Kh'],
  plo4: ['Ah', 'Kh', 'Qd', 'Jd'],
  plo5: ['Ah', 'Kh', 'Qd', 'Jd', 'Tc'],
  plo6: ['Ah', 'Kh', 'Qd', 'Jd', 'Tc', '9c'],
  plo8: ['Ah', 'Kh', 'Qd', 'Jd'],
};

const BOARD_BY_STREET = {
  preflop: [],
  flop: ['Jh', '8h', '3c'],
  turn: ['Jh', '8h', '3c', '5d'],
  river: ['Jh', '8h', '3c', '5d', '2s'],
};

const pillStyle = (active) => ({
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

export default function MixedStrategyLabPage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [street, setStreet] = useState('flop');
  const [effectiveStackBb, setEffectiveStackBb] = useState(100);
  const [pot, setPot] = useState(12);
  const [toCall, setToCall] = useState(4);
  const [rakeEnv, setRakeEnv] = useState('mid');

  const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
  const boardCards = BOARD_BY_STREET[street] || BOARD_BY_STREET.flop;

  const brainEval = useMemo(
    () =>
      evaluateTrainingSpotWithHorseBrain({
        variant: activeVariant,
        street,
        heroCards,
        boardCards,
        pot,
        toCall,
        effectiveStackBb,
      }),
    [activeVariant, street, heroCards, boardCards, pot, toCall, effectiveStackBb]
  );

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        { gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005', variant: activeVariant },
        'mixed-strategy-lab'
      ),
    [activeVariant]
  );

  return (
    <>
      <SEOHead
        title="Mixed Strategy Lab - Smarter.Poker"
        description="Opening The Authored Mixed-Strategy Game. The Retired Preview Used An Illustrative Curve That Was Not Solver Output."
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
            maxWidth: 820,
            margin: '0 auto',
            padding: 'clamp(24px, 5vw, 48px)',
            border: '1px solid rgba(145,229,255,.45)',
            background: 'linear-gradient(145deg, rgba(20,42,60,.97), rgba(4,9,15,.98))',
            boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Verified Club Arena Drill
            </div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>
              Mixed Strategy Lab
            </h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>
              Opening The Authored Mixed-Strategy Game. The Retired Preview Used An Illustrative Curve That Was Not Solver Output.
            </p>

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#67e8f9', textTransform: 'uppercase' }}>
                  Horse Brain Equilibrium &amp; EV Calibration Panel
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                  {`Engine: ${brainEval.engineModule} · Action: ${brainEval.correctAnswerText}`}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Variant</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                      <button key={v} type="button" data-variant-option={v} onClick={() => setActiveVariant(v)} style={pillStyle(activeVariant === v)}>
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Street</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {['preflop', 'flop', 'turn', 'river'].map((st) => (
                      <button key={st} type="button" data-street-option={st} onClick={() => setStreet(st)} style={pillStyle(street === st)}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Stack Depth</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[20, 50, 100, 200].map((stk) => (
                      <button key={stk} type="button" data-stack-option={stk} onClick={() => setEffectiveStackBb(stk)} style={pillStyle(effectiveStackBb === stk)}>
                        {stk} BB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Pot Size</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[6, 12, 24].map((p) => (
                      <button key={p} type="button" data-pot-option={p} onClick={() => setPot(p)} style={pillStyle(pot === p)}>
                        {p} BB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Facing Bet</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[0, 4, 8, 16].map((bet) => (
                      <button key={bet} type="button" data-facing-bet-option={bet} onClick={() => setToCall(bet)} style={pillStyle(toCall === bet)}>
                        {bet} BB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Rake Environment</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {['low', 'mid', 'high'].map((rk) => (
                      <button key={rk} type="button" data-rake-option={rk} onClick={() => setRakeEnv(rk)} style={pillStyle(rakeEnv === rk)}>
                        {rk.charAt(0).toUpperCase() + rk.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Hand Strength</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc' }}>{brainEval.handScore}/100</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Category</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8' }}>{brainEval.madeHandCategory}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Recommended Action</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#4ade80' }}>{brainEval.correctAnswerText}</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>{brainEval.explanation}</div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
              <button
                type="button"
                data-launch-club-arena-cta="true"
                data-launch-href={arenaHref}
                onClick={() => router.push(arenaHref)}
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
                Practice Equilibrium Spot In Club Arena →
              </button>
              <a
                href={CANONICAL_MIXED_ARENA_HREF}
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
                }}
              >
                Continue To Mixed Strategy Training →
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
