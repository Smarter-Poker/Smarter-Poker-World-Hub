import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const VERIFIED_DRILL = '/hub/training/arena/adv-008?level=1&source=villain-range';

const VARIANTS = [
  { id: 'nlh', label: 'NLHE (2 Cards)', heroCards: ['Ac', 'Kc'] },
  { id: 'plo4', label: 'PLO4 (4 Cards)', heroCards: ['Ac', 'Kc', 'Qh', 'Jh'] },
  { id: 'plo5', label: 'PLO5 (5 Cards)', heroCards: ['Ac', 'Kc', 'Qh', 'Jh', 'Td'] },
  { id: 'plo6', label: 'PLO6 (6 Cards)', heroCards: ['Ac', 'Kc', 'Qh', 'Jh', 'Td', '9d'] },
  { id: 'plo8', label: 'PLO8 (Hi-Lo)', heroCards: ['Ac', 'Kc', 'Qh', 'Jh'] },
];

const VILLAIN_RANGES = [
  { id: 'Wide Loose-Passive Range (44% VPIP)', label: 'Wide Capped Range (44/11)', vpip: 44, pfr: 11, threeBet: 3, pot: 12, toCall: 0 },
  { id: 'Ultra-Tight Linear Range (12% VPIP)', label: 'Tight Linear Range (12/10)', vpip: 12, pfr: 10, threeBet: 3, pot: 14, toCall: 9 },
  { id: 'Polarized 3-Bet Range (36% VPIP)', label: 'Polarized LAG Range (36/29)', vpip: 36, pfr: 29, threeBet: 15, pot: 18, toCall: 6 },
  { id: 'Balanced Equilibrium Range (23% VPIP)', label: 'Equilibrium Range (23/19)', vpip: 23, pfr: 19, threeBet: 8, pot: 12, toCall: 4 },
];

export default function VillainRangePage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [activeRangeId, setActiveRangeId] = useState(VILLAIN_RANGES[0].id);

  const activeVariantSpec = VARIANTS.find((v) => v.id === activeVariant) || VARIANTS[0];
  const activeRange = VILLAIN_RANGES.find((r) => r.id === activeRangeId) || VILLAIN_RANGES[0];

  const brainEval = useMemo(() => {
    return evaluateTrainingSpotWithHorseBrain({
      gameId: 'adv-008',
      variant: activeVariantSpec.id,
      heroCards: activeVariantSpec.heroCards,
      boardCards: ['As', '9h', '4d'],
      street: 'flop',
      pot: activeRange.pot,
      toCall: activeRange.toCall,
      effectiveStackBb: 100,
      heroPosition: 'BTN',
      villainPosition: 'BB',
      villainStats: {
        vpip: activeRange.vpip,
        pfr: activeRange.pfr,
        threeBet: activeRange.threeBet,
      },
      villainArchetype: activeRange.id,
    });
  }, [activeVariantSpec, activeRange]);

  const launchHref = useMemo(
    () => buildCustomTrainingArenaHref({ gameId: 'adv-003', variant: activeVariantSpec.id }, 'villain-range'),
    [activeVariantSpec.id],
  );

  const exploitDelta = brainEval?.brainEvaluation?.hudExploitAdjustment?.scoreDelta ?? 0;

  return (
    <>
      <SEOHead title="Range Advantage - Smarter.Poker" description="Opening the authored Range Advantage curriculum. Profile configuration and three-choice heuristics no longer affect training accuracy." noindex />
      <main style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)', color: '#fff' }}>
        <section style={{ position: 'relative', maxWidth: 760, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, rgba(9, 23, 39, 0.96) 0%, rgba(3, 11, 20, 0.98) 100%)', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Verified Club Arena Drill</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>Range Advantage</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>Model Villain Range Widths And Nut Advantage Across Variants Using Production Horse Brain Telemetry Before Drilling In Club Arena.</p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-villain-vpip={String(activeRange.vpip)}
                data-exploit-delta={String(exploitDelta)}
                style={{ marginTop: 24, padding: 20, border: '1px solid rgba(56, 189, 248, 0.4)', background: 'rgba(2, 6, 23, 0.72)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#79e6ff', textTransform: 'uppercase' }}>
                    Horse Brain Exploitative Deviation Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                    Engine: {brainEval.engineModule} | VPIP: {activeRange.vpip}% | PFR: {activeRange.pfr}% | Delta: {exploitDelta >= 0 ? `+${exploitDelta}` : exploitDelta}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {VARIANTS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      data-variant-btn={v.id}
                      aria-pressed={activeVariant === v.id}
                      onClick={() => setActiveVariant(v.id)}
                      style={{
                        padding: '6px 12px',
                        border: activeVariant === v.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.16)',
                        background: activeVariant === v.id ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.04)',
                        color: activeVariant === v.id ? '#7dd3fc' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {VILLAIN_RANGES.map((rng) => (
                    <button
                      key={rng.id}
                      type="button"
                      data-archetype-btn={rng.id}
                      aria-pressed={activeRangeId === rng.id}
                      onClick={() => setActiveRangeId(rng.id)}
                      style={{
                        padding: '6px 12px',
                        border: activeRangeId === rng.id ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.14)',
                        background: activeRangeId === rng.id ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                        color: activeRangeId === rng.id ? '#6ee7b7' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {rng.label}
                    </button>
                  ))}
                </div>

                <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 800, color: '#6ee7b7' }}>
                  Recommended Action: {brainEval.correctAnswerText} ({brainEval.correctAnswer}) | Hand Score: {brainEval.handScore}/100
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {brainEval.explanation}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <button
                    type="button"
                    data-launch-club-arena-cta="true"
                    onClick={() => router.push(launchHref)}
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
                    Practice Exploit In Club Arena →
                  </button>
                  <a
                    href={VERIFIED_DRILL}
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
                    Continue To Range Advantage →
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
