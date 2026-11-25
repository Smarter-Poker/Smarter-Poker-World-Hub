/**
 * RISK ANALYZER — Variance & Ruin Simulator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Monte Carlo simulator mapping winrate & standard deviation to Risk of Ruin %.
 * Runs 1,000 distinct paths of 10,000 hands to calculate actual bust rates.
 *
 * Route: /hub/training/risk-analyzer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-50 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-40 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['Ad', 'Kd'],
  plo4: ['Ad', 'Kd', 'Qs', 'Js'],
  plo5: ['Ad', 'Kd', 'Qs', 'Js', 'Th'],
  plo6: ['Ad', 'Kd', 'Qs', 'Js', 'Th', '9h'],
  plo8: ['Ad', 'Kd', 'Qs', 'Js'],
};

const BOARD_BY_STREET = {
  preflop: [],
  flop: ['Qd', '8d', '3c'],
  turn: ['Qd', '8d', '3c', '6s'],
  river: ['Qd', '8d', '3c', '6s', '2h'],
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

export default function RiskAnalyzerPage() {
  const router = useRouter();
  useTrainingBus('risk-analyzer');

  const [winRate, setWinRate] = useState(5.0); // bb/100
  const [stdDev, setStdDev] = useState(80); // bb/100 (Variance)
  const [bankroll, setBankroll] = useState(2500); // Total Buy-ins or BBs

  const [riskOfRuin, setRiskOfRuin] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [simulating, setSimulating] = useState(false);

  const [activeVariant, setActiveVariant] = useState('nlh');
  const [street, setStreet] = useState('flop');
  const [effectiveStackBb, setEffectiveStackBb] = useState(100);
  const [pot, setPot] = useState(12);
  const [toCall, setToCall] = useState(6);
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
        'risk-analyzer'
      ),
    [activeVariant]
  );

  // Standard Normal variate using Box-Muller transform
  const gaussianRandom = (mean = 0, stdev = 1) => {
    const u = 1 - Math.random(); // Converting [0,1) to (0,1]
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  };

  const runMonteCarlo = async () => {
    setSimulating(true);
    setRiskOfRuin(null);
    setChartData([]);

    // Yield execution to allow UI to render the "Simulating..." state
    await new Promise((r) => setTimeout(r, 100));

    const RUNS = 1000;
    const HANDS_PER_RUN = 10000; // Simulated sample size per career
    const CHUNKS = 100; // Check bankroll every 100 hands
    const wrPerChunk = (parseFloat(winRate) / 100) * CHUNKS;
    const sdPerChunk = parseFloat(stdDev) * Math.sqrt(CHUNKS / 100);
    const startingBr = parseFloat(bankroll);

    let bustCount = 0;
    let paths = []; // Sample 20 paths for the visual chart

    for (let i = 0; i < RUNS; i++) {
      let currentBr = startingBr;
      let path = [currentBr];
      let busted = false;

      for (let j = 0; j < HANDS_PER_RUN / CHUNKS; j++) {
        const chunkResult = gaussianRandom(wrPerChunk, sdPerChunk);
        currentBr += chunkResult;
        if (i < 20) path.push(currentBr); // Save for chart

        if (currentBr <= 0) {
          busted = true;
          // If busted, fill rest of path with 0s for the chart
          if (i < 20) {
            while (path.length <= HANDS_PER_RUN / CHUNKS) path.push(0);
          }
          break;
        }
      }
      if (busted) bustCount++;
      if (i < 20) paths.push({ id: i, data: path, busted });
    }

    const calculatedRisk = (bustCount / RUNS) * 100;
    setRiskOfRuin(calculatedRisk);
    setChartData(paths);
    setSimulating(false);

    // Simulation output is an estimate, not a graded poker decision. It must
    // never create a perfect session or affect streak and leaderboard data.
  };

  return (
    <>
      <SEOHead
        title="Poker Risk Of Ruin & Variance Tool"
        description="Simulate Thousands Of Monte Carlo Poker Bankroll Trajectories To Calculate Risk Of Ruin, Downswing Probabilities, And Variance Cushions On Smarter.Poker."
        canonical="/hub/training/risk-analyzer"
      />
      <div
        className="sp-training-tool sp-training-tool--analysis sp-analysis-risk"
        style={{
          minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: '#040d18',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
          paddingBottom: 60,
        }}
      >
        {/* Header */}
        <div
          className="sp-training-analysis-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              marginRight: 16,
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Risk Analyzer</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>Monte Carlo Bankroll Simulator</div>
          </div>
        </div>

        <div
          className="sp-training-analysis-main sp-risk-analysis-layout"
          style={{
            maxWidth: 1000,
            margin: '40px auto',
            padding: '0 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 32,
          }}
        >
          {/* Controls */}
          <div
            className="sp-analysis-control-deck"
            style={{
              flex: '1 1 350px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 16,
              padding: 32,
            }}
          >
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg-muted)' }}>
                  True Win Rate (BB/100)
                </label>
                <span style={{ color: 'var(--sp-accent-green)', fontWeight: 800 }}>{winRate} BB</span>
              </div>
              <input
                aria-label="Expected Return Percentage"
                type="range"
                min="-5"
                max="25"
                step="0.5"
                value={winRate}
                onChange={(e) => setWinRate(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--sp-accent-green)' }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg-muted)' }}>
                  Standard Deviation
                </label>
                <span style={{ color: 'var(--sp-accent-amber)', fontWeight: 800 }}>{stdDev} BB/100</span>
              </div>
              <input
                aria-label="Standard Deviation"
                type="range"
                min="40"
                max="180"
                step="5"
                value={stdDev}
                onChange={(e) => setStdDev(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--sp-accent-amber)' }}
              />
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 4 }}>
                Live Full Ring ~ 60 | Online 6-Max ~ 90 | PLO ~ 140
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg-muted)' }}>
                  Dedicated Bankroll (BBs)
                </label>
                <span style={{ color: 'var(--sp-accent-cyan)', fontWeight: 800 }}>{bankroll} BBs</span>
              </div>
              <input
                aria-label="Simulation Sample Size"
                type="range"
                min="500"
                max="10000"
                step="100"
                value={bankroll}
                onChange={(e) => setBankroll(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--sp-accent-cyan)' }}
              />
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 4 }}>
                E.G. 25 Buy-Ins At 100BB = 2500 BBs
              </div>
            </div>

            <motion.button
              className="sp-analysis-primary-action"
              whileTap={{ scale: 0.96 }}
              onClick={runMonteCarlo}
              disabled={simulating}
              style={{
                width: '100%',
                padding: '16px',
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-blue-rgb), 1), #6366f1)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
              }}
            >
              {simulating ? 'RUNNING 1,000 CAREERS...' : 'RUN MONTE CARLO SIMULATION'}
            </motion.button>
          </div>

          {/* Output & Chart */}
          <div className="sp-analysis-output-deck" style={{ flex: '2 1 450px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {riskOfRuin !== null && !simulating ? (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    padding: 32,
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 24,
                    border: `1px solid ${riskOfRuin > 5 ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 24,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: 'var(--sp-fg-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: 2,
                        }}
                      >
                        Risk Of Ruin
                      </div>
                      <div
                        style={{
                          fontSize: 56,
                          fontWeight: 900,
                          color: riskOfRuin > 5 ? 'var(--sp-accent-red)' : 'var(--sp-accent-green)',
                          letterSpacing: '-1px',
                          lineHeight: 1,
                        }}
                      >
                        {riskOfRuin < 0.1 && riskOfRuin > 0 ? '< 0.1' : (Number.isFinite(Number(riskOfRuin)) ? Number(riskOfRuin) : 0).toFixed(1)}%
                      </div>
                    </div>
                    <div
                      style={{
                        width: '50%',
                        fontSize: 13,
                        color: 'var(--sp-fg)',
                        lineHeight: 1.5,
                        background: 'rgba(255,255,255,0.03)',
                        padding: 16,
                        borderRadius: 12,
                      }}
                    >
                      {riskOfRuin === 100
                        ? 'Mathematical certainty of going broke. Your win rate must be positive.'
                        : riskOfRuin > 10
                          ? 'Extremely dangerous bankroll management. Increase your bankroll or drop stakes immediately.'
                          : riskOfRuin > 5
                            ? 'Aggressive shot-taking. Prepare to move down if a downswing occurs.'
                            : riskOfRuin > 1
                              ? 'Standard professional risk tolerance. Bankroll is adequate for variance.'
                              : 'Ultra-safe bankroll. You are statistically bulletproof against standard downswings.'}
                    </div>
                  </div>

                  {/* Mini SVG Chart of standard paths */}
                  <div
                    style={{
                      height: 200,
                      position: 'relative',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      borderLeft: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {/* Chart Zero Line */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        borderBottom: '1px dashed rgba(239,68,68,0.5)',
                        zIndex: 0,
                      }}
                    />

                    <svg
                      width="100%"
                      height="100%"
                      preserveAspectRatio="none"
                      viewBox={`0 0 100 100`}
                      style={{ overflow: 'visible' }}
                    >
                      {chartData.map((pathObj) => {
                        const maxBankroll = Math.max(
                          parseFloat(bankroll) * 4,
                          ...chartData.flatMap((p) => p.data)
                        );
                        // Generate points normalized 0-100
                        const points = pathObj.data
                          .map((val, idx) => {
                            const x = (idx / (pathObj.data.length - 1)) * 100;
                            // Normalize Y so 0 is at bottom (or near bottom) and max is at top
                            const y = 100 - (val / maxBankroll) * 100;
                            return `${x},${y}`;
                          })
                          .join(' ');

                        return (
                          <polyline
                            key={pathObj.id}
                            points={points}
                            fill="none"
                            stroke={pathObj.busted ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.3)'}
                            strokeWidth={pathObj.busted ? '1.5' : '0.5'}
                            opacity={0.8}
                          />
                        );
                      })}
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -20,
                        right: 0,
                        fontSize: 12,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      10,000 Hands
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        top: -20,
                        left: 0,
                        fontSize: 12,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      Bankroll
                    </div>
                  </div>
                  <div
                    style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textAlign: 'center', marginTop: 32 }}
                  >
                    Sample Subset Of 20 Careers Plotted Out Of 1,000 Simulated.
                  </div>
                </motion.div>
              </AnimatePresence>
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: simulating ? 1 : 0.4,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 24,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {simulating ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, ease: 'linear', duration: 1 }}
                      style={{
                        width: 60,
                        height: 60,
                        border: '4px solid rgba(59,130,246,0.2)',
                        borderTopColor: 'var(--sp-accent-blue)',
                        borderRadius: '50%',
                        marginBottom: 24,
                      }}
                    />
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                      Simulating 1,000 Careers...
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', marginTop: 8 }}>
                      Rolling 10,000,000 Hands Of Variance.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 50, marginBottom: 20 }}>▼</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                      Simulate Variance
                    </div>
                    <div
                      style={{ fontSize: 14, color: 'var(--sp-fg-muted)', marginTop: 8, textAlign: 'center' }}
                    >
                      Find Out If Your Bankroll Can Survive
                      <br />
                      The Mathematical Realities Of The Game.
                    </div>
                  </>
                )}
              </div>
            )}

            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainEval.engineModule}
              data-recommended-action={brainEval.correctAnswer}
              data-active-variant={activeVariant}
              style={{
                padding: 20,
                borderRadius: 16,
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
                      <button
                        key={v}
                        type="button"
                        data-variant-option={v}
                        onClick={() => {
                          setActiveVariant(v);
                          setStdDev(v === 'nlh' ? 85 : v === 'plo8' ? 115 : v === 'plo4' ? 135 : v === 'plo5' ? 155 : 175);
                        }}
                        style={pillStyle(activeVariant === v)}
                      >
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
                    {[0, 3, 6, 12].map((bet) => (
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

              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 14 }}>{brainEval.explanation}</div>

              <button
                type="button"
                data-launch-club-arena-cta="true"
                data-launch-href={arenaHref}
                onClick={() => router.push(arenaHref)}
                style={{
                  display: 'inline-flex',
                  minHeight: 44,
                  alignItems: 'center',
                  padding: '0 18px',
                  borderRadius: 8,
                  border: '1px solid #67e8f9',
                  background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Practice Equilibrium Spot In Club Arena →
              </button>
            </div>
          </div>
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-risk-analyzer" />
    </>
  );
}
