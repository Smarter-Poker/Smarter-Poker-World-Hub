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
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import { TrendingDown } from 'lucide-react';
import at from '../../../src/styles/training/analysis-tools.module.css';
export default function RiskAnalyzerPage() {
  const router = useRouter();
  useTrainingBus('risk-analyzer');

  const [winRate, setWinRate] = useState(5.0); // bb/100
  const [stdDev, setStdDev] = useState(80); // bb/100 (Variance)
  const [bankroll, setBankroll] = useState(2500); // Total Buy-ins or BBs

  const [riskOfRuin, setRiskOfRuin] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


  // Standard Normal variate using Box-Muller transform
  const gaussianRandom = (mean = 0, stdev = 1) => {
    const u = 1 - Math.random(); // Converting [0,1) to (0,1]
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  };

  // Clear stale results on edits so they always describe the selected inputs.
  const runMonteCarlo = async () => {
    setLoading(true);
    setError(null);
    setRiskOfRuin(null);
    setChartData([]);

    // Yield execution to allow UI to render the "Simulating..." state
    await new Promise((r) => setTimeout(r, 100));

    try {
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
    } catch (_) {
      setError('Could Not Calculate The Estimate. Try Again.');
    } finally {
      setLoading(false);
    }

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
      <div className={`sp-training-tool sp-training-tool--analysis sp-analysis-risk ${at.shell}`}>
        <TrainingPageHead slug="training-risk-analyzer" note="Monte Carlo Bankroll Simulator" />

        <div className={`sp-training-analysis-main sp-risk-analysis-layout ${at.page}`}>
          {/* Controls */}
          <section className={`sp-analysis-control-deck sd-panel ${at.panel}`} aria-label="Simulation Inputs">
            <label className={at.field}>
              <span className={at.barHead}>
                <span>True Win Rate (BB/100)</span>
                <strong className={at.ice}>{winRate} BB</strong>
              </span>
              <input
                aria-label="Expected Return Percentage"
                type="range"
                className={at.range}
                min="-5"
                max="25"
                step="0.5"
                value={winRate}
                disabled={loading}
                onChange={(e) => { setWinRate(e.target.value); setRiskOfRuin(null); setError(null); }}
              />
            </label>

            <label className={at.field}>
              <span className={at.barHead}>
                <span>Standard Deviation</span>
                <strong className={at.ice}>{stdDev} BB/100</strong>
              </span>
              <input
                aria-label="Standard Deviation"
                type="range"
                className={at.range}
                min="40"
                max="180"
                step="5"
                value={stdDev}
                disabled={loading}
                onChange={(e) => { setStdDev(e.target.value); setRiskOfRuin(null); setError(null); }}
              />
              <span className={at.small}>Live Full Ring ~ 60 | Online 6-Max ~ 90 | PLO ~ 140</span>
            </label>

            <label className={at.field}>
              <span className={at.barHead}>
                <span>Dedicated Bankroll (BBs)</span>
                <strong className={at.ice}>{bankroll} BBs</strong>
              </span>
              <input
                aria-label="Simulation Sample Size"
                type="range"
                className={at.range}
                min="500"
                max="10000"
                step="100"
                value={bankroll}
                disabled={loading}
                onChange={(e) => { setBankroll(e.target.value); setRiskOfRuin(null); setError(null); }}
              />
              <span className={at.small}>E.G. 25 Buy-Ins At 100BB = 2500 BBs</span>
            </label>

            <motion.button
              type="button"
              className="sp-analysis-primary-action"
              whileTap={{ scale: 0.97 }}
              onClick={runMonteCarlo}
              disabled={loading}
            >
              {loading ? 'Calculating…' : error ? 'Retry Estimate' : 'Calculate Risk'}
            </motion.button>
            {error && <div role="alert" className={at.error}>{error}</div>}
          </section>

          {/* Output & Chart */}
          <div className="sp-analysis-output-deck">
            {riskOfRuin !== null && !loading ? (
              <AnimatePresence>
                <motion.section
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`sd-panel ${at.panel}`}
                  aria-label="Risk Of Ruin Result"
                >
                  <div className={at.metric} style={{ textAlign: 'left' }}>
                    <span className={at.metricLabel}>Risk Of Ruin</span>
                    <strong className={at.bigFigure} style={{ textAlign: 'left', color: riskOfRuin > 5 ? '#ff7a86' : '#5ee08a' }}>
                      {riskOfRuin < 0.1 && riskOfRuin > 0 ? '< 0.1' : (Number.isFinite(Number(riskOfRuin)) ? Number(riskOfRuin) : 0).toFixed(1)}%
                    </strong>
                  </div>
                  <p className={at.note}>
                    {riskOfRuin === 100
                      ? 'Mathematical Certainty Of Going Broke. Your Win Rate Must Be Positive.'
                      : riskOfRuin > 10
                        ? 'Extremely Dangerous Bankroll Management. Increase Your Bankroll Or Drop Stakes Immediately.'
                        : riskOfRuin > 5
                          ? 'Aggressive Shot-Taking. Prepare To Move Down If A Downswing Occurs.'
                          : riskOfRuin > 1
                            ? 'Standard Professional Risk Tolerance. Bankroll Is Adequate For Variance.'
                            : 'Ultra-Safe Bankroll. You Are Statistically Bulletproof Against Standard Downswings.'}
                  </p>

                  {/* Mini SVG Chart of standard paths */}
                  <div className={at.chartFrame}>
                    <span className={at.chartAxisY}>Bankroll</span>
                    <div className={at.chart}>
                      <svg
                        width="100%"
                        height="100%"
                        preserveAspectRatio="none"
                        viewBox={`0 0 100 100`}
                        role="img"
                        aria-label={`Sample Bankroll Paths, ${chartData.filter((p) => p.busted).length} Of ${chartData.length} Plotted Careers Went Broke`}
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
                              stroke={pathObj.busted ? 'rgba(255,122,134,0.7)' : 'rgba(134,218,255,0.45)'}
                              strokeWidth={pathObj.busted ? '1.5' : '0.6'}
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })}
                      </svg>
                    </div>
                    <span className={at.chartAxisX}>10,000 Hands</span>
                  </div>
                  <div className={at.legend} style={{ gridAutoFlow: 'column', justifyContent: 'start', gap: 16 }}>
                    <span className={at.legendItem}><span className={at.legendSwatch} style={{ background: '#86daff' }} aria-hidden />Survived</span>
                    <span className={at.legendItem}><span className={at.legendSwatch} style={{ background: '#ff7a86' }} aria-hidden />Went Broke</span>
                  </div>
                  <p className={at.small} style={{ textAlign: 'center' }}>
                    Sample Subset Of 20 Careers Plotted Out Of 1,000 Simulated.
                  </p>
                </motion.section>
              </AnimatePresence>
            ) : (
              <section className={`sd-panel ${at.empty}`} aria-live="polite">
                {loading ? (
                  <>
                    <span className={at.spinner} aria-hidden />
                    <h2 className={at.subTitle}>Simulating 1,000 Careers...</h2>
                    <p className={at.copy}>Rolling 10,000,000 Hands Of Variance.</p>
                  </>
                ) : (
                  <>
                    <TrendingDown size={40} aria-hidden />
                    <h2 className={at.subTitle}>Simulate Variance</h2>
                    <p className={at.copy}>
                      Find Out If Your Bankroll Can Survive The Mathematical Realities Of The Game.
                    </p>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-risk-analyzer" />
    </>
  );
}
