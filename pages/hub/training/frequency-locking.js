import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const VERIFIED_DRILL = '/hub/training/arena/adv-005?level=1&source=frequency-locking';

const VARIANTS = [
  { id: 'nlh', label: 'NLHE (2 Cards)', heroCards: ['Js', 'Ts'] },
  { id: 'plo4', label: 'PLO4 (4 Cards)', heroCards: ['Js', 'Ts', '9h', '8h'] },
  { id: 'plo5', label: 'PLO5 (5 Cards)', heroCards: ['Js', 'Ts', '9h', '8h', '7d'] },
  { id: 'plo6', label: 'PLO6 (6 Cards)', heroCards: ['Js', 'Ts', '9h', '8h', '7d', '6c'] },
  { id: 'plo8', label: 'PLO8 (Hi-Lo)', heroCards: ['Js', 'Ts', '9h', '8h'] },
];

const FREQUENCY_LOCK_MODES = [
  { id: '20% Bluff Frequency (Nit)', label: 'Lock 20% Bluff (13/9)', vpip: 13, pfr: 9, threeBet: 3, pot: 16, toCall: 12 },
  { id: '50% Balanced Frequency', label: 'Lock 50% Balanced (24/20)', vpip: 24, pfr: 20, threeBet: 8, pot: 16, toCall: 8 },
  { id: '75% Over-Bluff Frequency', label: 'Lock 75% Bluff (41/33)', vpip: 41, pfr: 33, threeBet: 15, pot: 16, toCall: 5 },
  { id: '10% Passive Check Frequency', label: 'Lock 10% Aggro (45/10)', vpip: 45, pfr: 10, threeBet: 2, pot: 12, toCall: 0 },
];

export default function FrequencyLockingPage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [activeFreqId, setActiveFreqId] = useState(FREQUENCY_LOCK_MODES[0].id);

  const activeVariantSpec = VARIANTS.find((v) => v.id === activeVariant) || VARIANTS[0];
  const activeFreq = FREQUENCY_LOCK_MODES.find((f) => f.id === activeFreqId) || FREQUENCY_LOCK_MODES[0];

  const brainEval = useMemo(() => {
    return evaluateTrainingSpotWithHorseBrain({
      gameId: 'adv-005',
      variant: activeVariantSpec.id,
      heroCards: activeVariantSpec.heroCards,
      boardCards: ['Qh', '9c', '4s'],
      street: 'flop',
      pot: activeFreq.pot,
      toCall: activeFreq.toCall,
      effectiveStackBb: 100,
      heroPosition: 'BTN',
      villainPosition: 'BB',
      villainStats: {
        vpip: activeFreq.vpip,
        pfr: activeFreq.pfr,
        threeBet: activeFreq.threeBet,
      },
      villainArchetype: activeFreq.id,
    });
  }, [activeVariantSpec, activeFreq]);

  const launchHref = useMemo(
    () => buildCustomTrainingArenaHref({ gameId: 'adv-003', variant: activeVariantSpec.id }, 'frequency-locking'),
    [activeVariantSpec.id],
  );

  const exploitDelta = brainEval?.brainEvaluation?.hudExploitAdjustment?.scoreDelta ?? 0;

  return (
    <>
      <SEOHead title="Frequency Math - Smarter.Poker" description="Opening the authored mixed-frequency curriculum. Resetting a control no longer records a perfect answer." noindex />
      <main style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)', color: '#fff' }}>
        <section style={{ position: 'relative', maxWidth: 760, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, rgba(9, 23, 39, 0.96) 0%, rgba(3, 11, 20, 0.98) 100%)', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Verified Club Arena Drill</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>Frequency Math</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>Test Mixed-Strategy Frequency Locks And Exploitative Counter-Weights Using Production Horse Brain Before Launching Club Arena.</p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-villain-vpip={String(activeFreq.vpip)}
                data-exploit-delta={String(exploitDelta)}
                style={{ marginTop: 24, padding: 20, border: '1px solid rgba(56, 189, 248, 0.4)', background: 'rgba(2, 6, 23, 0.72)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#79e6ff', textTransform: 'uppercase' }}>
                    Horse Brain Exploitative Deviation Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                    Engine: {brainEval.engineModule} | VPIP: {activeFreq.vpip}% | PFR: {activeFreq.pfr}% | Delta: {exploitDelta >= 0 ? `+${exploitDelta}` : exploitDelta}
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
                  {FREQUENCY_LOCK_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      data-archetype-btn={mode.id}
                      aria-pressed={activeFreqId === mode.id}
                      onClick={() => setActiveFreqId(mode.id)}
                      style={{
                        padding: '6px 12px',
                        border: activeFreqId === mode.id ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.14)',
                        background: activeFreqId === mode.id ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                        color: activeFreqId === mode.id ? '#6ee7b7' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {mode.label}
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
                    Continue To Frequency Math →
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
