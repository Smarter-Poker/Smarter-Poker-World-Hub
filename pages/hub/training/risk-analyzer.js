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
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

export default function RiskAnalyzerPage() {
  const router = useRouter();
  useTrainingBus('risk-analyzer');

  const [winRate, setWinRate] = useState(5.0); // bb/100
  const [stdDev, setStdDev] = useState(80); // bb/100 (Variance)
  const [bankroll, setBankroll] = useState(2500); // Total Buy-ins or BBs

  const [riskOfRuin, setRiskOfRuin] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [simulating, setSimulating] = useState(false);

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

    // Save session & Emit Global Event
    try {
      const token = getAccessToken();
      if (token) {
        await authedFetch('/api/training/save-session', {
          method: 'POST',
          body: JSON.stringify({
            gameId: 'risk-analyzer',
            questionsAnswered: 1,
            questionsCorrect: 1,
            accuracy: 100,
          }),
        });
      }
      eventBus?.emit?.(
        EventType?.SESSION_END || 'session:end',
        { accuracy: 100, questionsAnswered: 1, questionsCorrect: 1 },
        'risk-analyzer'
      );
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <>
      <Head>
        <title>Risk Analyzer | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: '#0B0D11',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
          paddingBottom: 60,
        }}
      >
        {/* Header */}
        <div
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
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Monte Carlo Bankroll Simulator</div>
          </div>
        </div>

        <div
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
                  True Win Rate (bb/100)
                </label>
                <span style={{ color: 'var(--sp-accent-green)', fontWeight: 800 }}>{winRate} bb</span>
              </div>
              <input
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
                <span style={{ color: 'var(--sp-accent-amber)', fontWeight: 800 }}>{stdDev} bb/100</span>
              </div>
              <input
                type="range"
                min="40"
                max="180"
                step="5"
                value={stdDev}
                onChange={(e) => setStdDev(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--sp-accent-amber)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)', marginTop: 4 }}>
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
                type="range"
                min="500"
                max="10000"
                step="100"
                value={bankroll}
                onChange={(e) => setBankroll(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--sp-accent-cyan)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)', marginTop: 4 }}>
                E.g. 25 Buy-ins at 100BB = 2500 BBs
              </div>
            </div>

            <motion.button
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
          <div style={{ flex: '2 1 450px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                        Risk of Ruin
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
                        fontSize: 10,
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
                        fontSize: 10,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      Bankroll
                    </div>
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--sp-fg-dim)', textAlign: 'center', marginTop: 32 }}
                  >
                    Sample subset of 20 careers plotted out of 1,000 simulated.
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
                      Rolling 10,000,000 hands of variance.
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
                      Find out if your bankroll can survive
                      <br />
                      the mathematical realities of the game.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
