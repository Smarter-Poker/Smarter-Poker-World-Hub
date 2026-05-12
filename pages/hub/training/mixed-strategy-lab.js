// TRAIN-CSS-TOKENS-BATCH5-31 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import dynamic from 'next/dynamic';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });

// BUG FIX (TRAIN-MSL-A11Y-1): SVG back-arrow + button hardening for the
// mixed-strategy lab. Page was already emoji-free. Same surface-specific
// a11y pattern as PR #320/#322/#324/#327-#360.
const _MSL_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function MslBackArrowIcon({ size=14 }) {
  return (
    <svg {..._MSL_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}


export default function MixedStrategyLab() {
  const router = useRouter();
  useTrainingBus('mixed-strategy-lab');

  // State for interactive slider
  const [bluffFreq, setBluffFreq] = useState(30); // Optimal is ~33%
  const optimalBluffFreq = 33.3;

  // Derived Data for Chart
  const chartData = Array.from({ length: 101 }, (_, i) => {
    const dev = Math.abs(i - optimalBluffFreq);
    let ev;
    if (i === optimalBluffFreq) {
      ev = 10; // Max EV
    } else {
      // EV drops off somewhat quadratically as you deviate from GTO
      ev = 10 - Math.pow(dev / 15, 2);
      if (ev < 0) ev = 0; // Floor at 0 for chart
    }
    return { freq: i, ev: parseFloat((Number.isFinite(Number(ev)) ? Number(ev) : 0).toFixed(2)) };
  });

  const currentEV = chartData[bluffFreq].ev;
  const evLoss = parseFloat((10 - currentEV).toFixed(2));

  const handleSaveSession = async () => {
    try {
      await authedFetch('/api/training/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: 'mixed-strategy-lab',
          stats: {
            lastTestedFrequency: bluffFreq,
            maxEvLossRecorded: evLoss,
          },
        }),
      });
    } catch (e) {
      console.warn('Failed to save session:', e);
    }
  };

  useEffect(() => {
    const t = setTimeout(handleSaveSession, 1000);
    return () => clearTimeout(t);
  }, [bluffFreq]);

  return (
    <>
    <PageTransition>
      <Head>
        <title>Mixed Strategy Lab | Smarter.Poker</title>
      </Head>
      <UniversalHeader />

      <div style={styles.container}>
        <div style={styles.header}>
          <button
            type="button"
            aria-label="Back to training hub"
            onClick={() => router.push('/hub/training')}
            style={styles.backButton}
          >
            {/* TRAIN-MSL-A11Y-1: SVG back arrow + visible label */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <MslBackArrowIcon size={14} />
              Hub
            </span>
          </button>
          <div>
            <h1 style={styles.title}>MIXED STRATEGY LAB</h1>
            <p style={styles.subtitle}>Visualize the mathematical cost of deviating from GTO</p>
          </div>
        </div>

        <div style={styles.content}>
          <div style={styles.mainCard}>
            <div style={styles.scenarioBadge}>SCENARIO: POLARIZED RIVER BLUFFING</div>
            <h2 style={styles.scenarioTitle}>The Mathematics of Unexploitability</h2>
            <p style={styles.scenarioDesc}>
              You bet pot on the river. Your opponent is getting 2:1 on a call. To make them
              indifferent (0 EV) to calling or folding with their bluff-catchers, you must construct
              a range that is precisely <strong>66.7% Value Bets</strong> and{' '}
              <strong>33.3% Bluffs</strong>.
            </p>

            <div style={styles.interactiveArea}>
              <div style={styles.labelRow}>
                <div style={{ ...styles.statLabel, color: 'var(--sp-accent-red)' }}>BLUFFS: {bluffFreq}%</div>
                <div style={{ ...styles.statLabel, color: 'var(--sp-accent-green)' }}>
                  VALUE: {100 - bluffFreq}%
                </div>
              </div>

              <div style={styles.sliderContainer}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bluffFreq}
                  onChange={(e) => setBluffFreq(Number(e.target.value))}
                  style={styles.slider}
                />
                <div style={styles.sliderOptimalMarker} />
              </div>

              <div style={styles.resultsGrid}>
                <div style={styles.resultBox}>
                  <div style={styles.resultLabel}>YOUR STRATEGY EV</div>
                  <div
                    style={{
                      ...styles.resultValue,
                      color: currentEV > 9 ? 'var(--sp-accent-green)' : currentEV > 6 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
                    }}
                  >
                    {currentEV} bb/100
                  </div>
                </div>
                <div style={styles.resultBox}>
                  <div style={styles.resultLabel}>EV LOSS VS GTO</div>
                  <div style={{ ...styles.resultValue, color: evLoss > 0 ? 'var(--sp-accent-red)' : 'var(--sp-accent-green)' }}>
                    -{evLoss} bb/100
                  </div>
                </div>
                <div style={styles.resultBox}>
                  <div style={styles.resultLabel}>VILLAIN'S BEST RESPONSE</div>
                  <div style={{ ...styles.resultValue, color: 'var(--sp-accent-cyan)' }}>
                    {bluffFreq > 33.3
                      ? 'Pure Call (Exploits You)'
                      : bluffFreq < 33.3
                        ? 'Pure Fold (Exploits You)'
                        : 'Indifferent (Cannot Exploit)'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Expectation Value (EV) Curve</h3>
            <p style={styles.chartDesc}>
              Notice how EV drops significantly as you under-bluff or over-bluff relative to the
              optimal 33.3% frequency.
            </p>
            <div style={styles.chartContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="freq" stroke="#64748b" tickFormatter={(val) => `${val}%`} />
                  <YAxis stroke="#64748b" domain={[0, 11]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                    itemStyle={{ color: 'var(--sp-accent-cyan)' }}
                    formatter={(value) => [`${value} bb`, 'EV']}
                    labelFormatter={(label) => `Bluff Frequency: ${label}%`}
                  />
                  <Area
                    type="monotone"
                    dataKey="ev"
                    stroke="#00d4ff"
                    fillOpacity={1}
                    fill="url(#colorEv)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
    <ConnectionToast />
    </>
  );
}

const styles = {
  container: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #05050A 0%, #0A0A15 100%)',
    padding: '24px 4vw 80px',
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 32,
    paddingBottom: 24,
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  backButton: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: 28,
    fontWeight: 900,
    fontFamily: 'Orbitron, sans-serif',
    letterSpacing: 1,
    color: 'var(--sp-accent-purple)', // Purple theme for theory/mixed strategy
  },
  subtitle: {
    margin: 0,
    color: 'var(--sp-fg-muted)',
    fontSize: 14,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
    maxWidth: 1000,
    margin: '0 auto',
  },
  mainCard: {
    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(0, 0, 0, 0.4))',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: 24,
    padding: 40,
    position: 'relative',
  },
  scenarioBadge: {
    background: 'var(--sp-accent-purple)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1,
    display: 'inline-block',
    marginBottom: 16,
  },
  scenarioTitle: {
    fontSize: 32,
    fontWeight: 900,
    margin: '0 0 16px 0',
    fontFamily: 'Orbitron, sans-serif',
  },
  scenarioDesc: {
    fontSize: 16,
    lineHeight: 1.6,
    color: 'var(--sp-fg)',
    marginBottom: 40,
    maxWidth: '80%',
  },
  interactiveArea: {
    background: 'rgba(0,0,0,0.5)',
    padding: 32,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.05)',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 24,
    fontWeight: 900,
    fontFamily: 'Orbitron, sans-serif',
  },
  sliderContainer: {
    position: 'relative',
    marginBottom: 40,
  },
  slider: {
    width: '100%',
    accentColor: 'var(--sp-accent-purple)',
    cursor: 'pointer',
    height: 6,
  },
  sliderOptimalMarker: {
    position: 'absolute',
    top: -10,
    left: 'calc(33.3% - 2px)',
    width: 4,
    height: 26,
    background: 'var(--sp-accent-green)',
    boxShadow: '0 0 10px rgba(74, 222, 128, 0.8)',
    pointerEvents: 'none',
  },
  resultsGrid: {
    display: 'flex',
    gap: 24,
  },
  resultBox: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    padding: 20,
    borderRadius: 12,
    textAlign: 'center',
  },
  resultLabel: {
    fontSize: 11,
    color: 'var(--sp-fg-muted)',
    fontWeight: 700,
    letterSpacing: 1,
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 24,
    fontWeight: 800,
    fontFamily: 'Orbitron, sans-serif',
  },
  chartCard: {
    background: 'rgba(10, 15, 30, 0.6)',
    border: '1px solid rgba(0, 212, 255, 0.15)',
    borderRadius: 24,
    padding: 40,
  },
  chartTitle: {
    fontSize: 20,
    color: '#fff',
    margin: '0 0 8px 0',
    fontFamily: 'Orbitron, sans-serif',
  },
  chartDesc: {
    color: 'var(--sp-fg-muted)',
    fontSize: 14,
    margin: '0 0 24px 0',
  },
  chartContainer: {
    width: '100%',
    height: 300,
  },
};