import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const VERIFIED_DRILL = '/hub/training/arena/cash-005?level=1&source=bluff-catcher';

const VARIANTS = [
  { id: 'nlh', label: 'NLHE (2 Cards)', heroCards: ['Kh', 'Qc'] },
  { id: 'plo4', label: 'PLO4 (4 Cards)', heroCards: ['As', 'Kh', 'Qd', 'Jc'] },
  { id: 'plo5', label: 'PLO5 (5 Cards)', heroCards: ['As', 'Kh', 'Qd', 'Jc', '9s'] },
  { id: 'plo6', label: 'PLO6 (6 Cards)', heroCards: ['As', 'Kh', 'Qd', 'Jc', '9s', '8d'] },
];

const RIVER_PROFILES = [
  { id: 'Over-Bluffing Maniac', label: 'Over-Bluffing Maniac (44/35)', vpip: 44, pfr: 35, threeBet: 15, pot: 24, toCall: 16 },
  { id: 'Under-Bluffing Nit', label: 'Under-Bluffing Nit (14/11)', vpip: 14, pfr: 11, threeBet: 3, pot: 24, toCall: 20 },
  { id: 'Passive Calling Station', label: 'Passive Station (42/10)', vpip: 42, pfr: 10, threeBet: 2, pot: 18, toCall: 6 },
  { id: 'Balanced Polarized Reg', label: 'Balanced Reg (25/21)', vpip: 25, pfr: 21, threeBet: 9, pot: 24, toCall: 18 },
];

export default function BluffCatcherPage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [activeProfileId, setActiveProfileId] = useState(RIVER_PROFILES[0].id);

  const activeVariantSpec = VARIANTS.find((v) => v.id === activeVariant) || VARIANTS[0];
  const activeProfile = RIVER_PROFILES.find((p) => p.id === activeProfileId) || RIVER_PROFILES[0];

  const brainEval = useMemo(() => {
    return evaluateTrainingSpotWithHorseBrain({
      gameId: 'cash-005',
      variant: activeVariantSpec.id,
      heroCards: activeVariantSpec.heroCards,
      boardCards: ['Ks', '9d', '4c', '2h', '7s'],
      street: 'river',
      pot: activeProfile.pot,
      toCall: activeProfile.toCall,
      effectiveStackBb: 100,
      heroPosition: 'BB',
      villainPosition: 'BTN',
      villainStats: {
        vpip: activeProfile.vpip,
        pfr: activeProfile.pfr,
        threeBet: activeProfile.threeBet,
      },
      villainArchetype: activeProfile.id,
    });
  }, [activeVariantSpec, activeProfile]);

  const launchHref = useMemo(
    () => buildCustomTrainingArenaHref({ gameId: 'cash-005', variant: activeVariantSpec.id }, 'bluff-catcher'),
    [activeVariantSpec.id],
  );

  const exploitDelta = brainEval?.brainEvaluation?.hudExploitAdjustment?.scoreDelta ?? 0;

  return (
    <>
      <SEOHead title="Bluff Catcher - Smarter.Poker" description="Opening the authored Bluff Catcher game with four contextual actions, unmistakable Correct or Incorrect feedback, and manual Next progression." noindex />
      <main style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)', color: '#fff' }}>
        <section style={{ position: 'relative', maxWidth: 760, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid rgba(145,229,255,.45)', background: 'linear-gradient(145deg, rgba(20,42,60,.97), rgba(4,9,15,.98))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Verified Club Arena Drill</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>Bluff Catcher</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>Evaluate Minimum Defense Frequency And River Bluff-Catching Thresholds Against Opponent HUD Profiles With Production Horse Brain Telemetry.</p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-villain-vpip={String(activeProfile.vpip)}
                data-exploit-delta={String(exploitDelta)}
                style={{ marginTop: 24, padding: 20, border: '1px solid rgba(56, 189, 248, 0.4)', background: 'rgba(2, 6, 23, 0.72)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#79e6ff', textTransform: 'uppercase' }}>
                    Horse Brain Exploitative Deviation Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                    Engine: {brainEval.engineModule} | VPIP: {activeProfile.vpip}% | PFR: {activeProfile.pfr}% | Delta: {exploitDelta >= 0 ? `+${exploitDelta}` : exploitDelta}
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
                  {RIVER_PROFILES.map((prof) => (
                    <button
                      key={prof.id}
                      type="button"
                      data-archetype-btn={prof.id}
                      aria-pressed={activeProfileId === prof.id}
                      onClick={() => setActiveProfileId(prof.id)}
                      style={{
                        padding: '6px 12px',
                        border: activeProfileId === prof.id ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.14)',
                        background: activeProfileId === prof.id ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                        color: activeProfileId === prof.id ? '#6ee7b7' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {prof.label}
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
                      background: 'linear-gradient(180deg, #2a6077, #07131d)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 900,
                      textDecoration: 'none',
                    }}
                  >
                    Continue To Bluff Catcher →
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
