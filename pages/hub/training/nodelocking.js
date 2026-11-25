import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const VERIFIED_DRILL = '/hub/training/arena/adv-003?level=1&source=nodelocking';

const VARIANTS = [
  { id: 'nlh', label: 'NLHE (2 Cards)', heroCards: ['Ah', 'Qd'] },
  { id: 'plo4', label: 'PLO4 (4 Cards)', heroCards: ['Ah', 'Kh', 'Qd', 'Jd'] },
  { id: 'plo5', label: 'PLO5 (5 Cards)', heroCards: ['Ah', 'Kh', 'Qd', 'Jd', 'Ts'] },
  { id: 'plo6', label: 'PLO6 (6 Cards)', heroCards: ['Ah', 'Kh', 'Qd', 'Jd', 'Ts', '9c'] },
  { id: 'plo8', label: 'PLO8 (Hi-Lo)', heroCards: ['Ah', 'Kh', 'Qd', 'Jd'] },
];

const NODE_LOCK_PRESETS = [
  { id: 'Lock Over-Fold Node', label: 'Over-Fold Node (14/11)', vpip: 14, pfr: 11, threeBet: 3, pot: 15, toCall: 0 },
  { id: 'Lock Over-Call Node', label: 'Over-Call Node (46/10)', vpip: 46, pfr: 10, threeBet: 2, pot: 15, toCall: 5 },
  { id: 'Lock Over-Raise Node', label: 'Over-Raise Node (39/31)', vpip: 39, pfr: 31, threeBet: 14, pot: 18, toCall: 11 },
  { id: 'Equilibrium Node', label: 'Equilibrium Node (24/20)', vpip: 24, pfr: 20, threeBet: 8, pot: 15, toCall: 6 },
];

/**
 * The former node-locking page calculated recommendations with local heuristic
 * formulas and stored profiles inside training-session rows. This route now
 * opens the canonical authored Node Locking game and no longer contaminates
 * accuracy, streak, or leaderboard metrics with configuration saves.
 */
export default function NodelockingPage() {
  const router = useRouter();
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [activeNodeId, setActiveNodeId] = useState(NODE_LOCK_PRESETS[0].id);

  useEffect(() => {
    if (router.isReady && router.query?.autoRedirect === '1') {
      router.replace(VERIFIED_DRILL);
    }
  }, [router]);

  const activeVariantSpec = VARIANTS.find((v) => v.id === activeVariant) || VARIANTS[0];
  const activeNode = NODE_LOCK_PRESETS.find((n) => n.id === activeNodeId) || NODE_LOCK_PRESETS[0];

  const brainEval = useMemo(() => {
    return evaluateTrainingSpotWithHorseBrain({
      gameId: 'adv-003',
      variant: activeVariantSpec.id,
      heroCards: activeVariantSpec.heroCards,
      boardCards: ['Qd', '8c', '3s', '2h'],
      street: 'turn',
      pot: activeNode.pot,
      toCall: activeNode.toCall,
      effectiveStackBb: 100,
      heroPosition: 'CO',
      villainPosition: 'BB',
      villainStats: {
        vpip: activeNode.vpip,
        pfr: activeNode.pfr,
        threeBet: activeNode.threeBet,
      },
      villainArchetype: activeNode.id,
    });
  }, [activeVariantSpec, activeNode]);

  const launchHref = useMemo(
    () => buildCustomTrainingArenaHref({ gameId: 'adv-003', variant: activeVariantSpec.id }, 'nodelocking'),
    [activeVariantSpec.id],
  );

  const exploitDelta = brainEval?.brainEvaluation?.hudExploitAdjustment?.scoreDelta ?? 0;

  return (
    <>
      <SEOHead title="Node Locking - Smarter.Poker" description="Verified node-locking training." noindex />
      <main style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)', color: '#fff' }}>
        <section style={{ position: 'relative', maxWidth: 760, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, rgba(9, 23, 39, 0.96) 0%, rgba(3, 11, 20, 0.98) 100%)', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(105,207,244,.14)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Verified Club Arena Drill</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>Node Locking</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>Inspect Locked Decision Nodes And Maximal Exploitative Counter-Strategies Computed By Production Horse Brain Before Entering Club Arena.</p>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-villain-vpip={String(activeNode.vpip)}
                data-exploit-delta={String(exploitDelta)}
                style={{ marginTop: 24, padding: 20, border: '1px solid rgba(56, 189, 248, 0.4)', background: 'rgba(2, 6, 23, 0.72)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#79e6ff', textTransform: 'uppercase' }}>
                    Horse Brain Exploitative Deviation Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                    Engine: {brainEval.engineModule} | VPIP: {activeNode.vpip}% | PFR: {activeNode.pfr}% | Delta: {exploitDelta >= 0 ? `+${exploitDelta}` : exploitDelta}
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
                  {NODE_LOCK_PRESETS.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      data-archetype-btn={node.id}
                      aria-pressed={activeNodeId === node.id}
                      onClick={() => setActiveNodeId(node.id)}
                      style={{
                        padding: '6px 12px',
                        border: activeNodeId === node.id ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.14)',
                        background: activeNodeId === node.id ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                        color: activeNodeId === node.id ? '#6ee7b7' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {node.label}
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
                    Continue To Node Locking →
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
