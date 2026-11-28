/**
 * ICM SIMULATOR — Final Table Math
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Independent Chip Model equity calculator. Maps chips to real $.
 *
 * Route: /hub/training/icm-simulator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-25 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-21 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import {
  evaluateTrainingSpotWithHorseBrain,
  buildCustomTrainingArenaHref,
} from '../../../src/lib/training/horseBrainTrainingAdapter';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import { Calculator } from 'lucide-react';
import at from '../../../src/styles/training/analysis-tools.module.css';
const ICM_SIM_HERO_CARDS_BY_VARIANT = {
  nlh: ['Ad', 'Js'],
  plo4: ['Ad', 'Kd', 'Qs', 'Js'],
  plo5: ['Ad', 'Kd', 'Qs', 'Js', 'Th'],
  plo6: ['Ad', 'Kd', 'Qs', 'Js', 'Th', '9h'],
  plo8: ['Ad', 'Kd', 'Qs', 'Js'],
};

export default function IcmSimulatorPage() {
  const router = useRouter();
  useTrainingBus('icm-simulator');

  const [players, setPlayers] = useState([
    { id: 1, name: 'Hero', stack: 500000 },
    { id: 2, name: 'Villain A', stack: 1200000 },
    { id: 3, name: 'Villain B', stack: 300000 },
    { id: 4, name: 'Villain C', stack: 850000 },
  ]);

  const [payouts, setPayouts] = useState([5000, 3000, 1500, 500]);
  const [equities, setEquities] = useState([]);
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState('');
  const [icmVariant, setIcmVariant] = useState('nlh');


  const runSim = async () => {
    setCalculating(true);
    setCalculationError('');
    try {
      const stacks = players.map((p) => Number(p.stack) || 0);
      const pays = payouts.map((p) => Number(p) || 0);
      const response = await authedFetch('/api/training/icm-calc', {
        method: 'POST',
        body: JSON.stringify({ stacks, prizes: pays }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Calculation Failed (${response.status})`);
      }
      const nextEquities = payload.results.map((result) => result.icmDollars);
      setEquities(nextEquities);
      authedFetch('/api/training/tool-records', {
        method: 'POST',
        body: JSON.stringify({
          tool_id: 'icm-simulator',
          record_type: 'icm_simulation',
          payload: {
            stacks,
            prizes: pays,
            equities: nextEquities,
          },
        }),
      }).catch(() => {});
    } catch (error) {
      setEquities([]);
      setCalculationError(error.message || 'ICM Calculation Failed');
    } finally {
      setCalculating(false);
    }
  };

  const totalPrizePool = payouts.reduce((a, b) => a + (Number(b) || 0), 0);
  const stacks = players.map((p) => Number(p.stack) || 0);
  const totalChips = stacks.reduce((a, b) => a + b, 0);
  const heroStackBb = Math.max(5, Math.round((Number(players[0]?.stack) || 500000) / 20000));
  const icmBrainEval = React.useMemo(() => {
    try {
      const numericPayouts = payouts.map((p) => Math.max(0, Number(p) || 0));
      const pool = numericPayouts.reduce((a, b) => a + b, 0) || 1;
      const firstShare = (numericPayouts[0] || 0) / pool;
      const minCash = numericPayouts.filter((p) => p > 0).slice(-1)[0] || 1;
      const topToMinRatio = (numericPayouts[0] || minCash) / Math.max(1, minCash);
      const payoutSkewAdjust = firstShare >= 0.65 ? -0.18 : firstShare <= 0.35 ? 0.22 : (0.5 - firstShare) * 0.6;
      const validStacks = stacks.filter((s) => s > 0);
      const minStack = validStacks.length > 0 ? Math.min(...validStacks) : 1;
      const maxStack = validStacks.length > 0 ? Math.max(...validStacks) : 1;
      const heroRaw = stacks[0] || 500000;
      const stackRankPenalty = heroRaw > minStack && heroRaw < maxStack ? 0.18 : heroRaw <= minStack ? 0.25 : -0.12;
      const baseBf = heroStackBb <= 20 ? 1.85 : heroStackBb >= 50 ? 1.25 : 1.55;
      const dynamicBubbleFactor = Number(
        Math.max(1.08, Math.min(2.45, baseBf + payoutSkewAdjust + stackRankPenalty + (topToMinRatio < 3 ? 0.12 : 0))).toFixed(2)
      );
      return evaluateTrainingSpotWithHorseBrain({
        gameId: 'mtt-001',
        variant: icmVariant,
        heroCards: ICM_SIM_HERO_CARDS_BY_VARIANT[icmVariant] || ICM_SIM_HERO_CARDS_BY_VARIANT.nlh,
        boardCards: [],
        street: 'preflop',
        pot: 2.5,
        stackDepth: heroStackBb,
        heroPosition: 'CO',
        villainPosition: 'BTN',
        isICM: true,
        bubbleFactor: dynamicBubbleFactor,
        payoutPressure: `Final Table (1st ${(firstShare * 100).toFixed(0)}%, BF ${dynamicBubbleFactor}x)`,
        options: [
          { id: 'raise', text: 'Open 2.1x BB' },
          { id: 'allin', text: `All-In (${heroStackBb} BB)` },
          { id: 'fold', text: 'Fold (ICM Tight)' },
        ],
      });
    } catch {
      return null;
    }
  }, [heroStackBb, payouts, stacks, icmVariant]);

  const icmArenaHref = React.useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          format: 'mtt',
          variant: icmVariant,
          streets: ['preflop'],
          positions: ['CO'],
          stackDepth: heroStackBb,
        },
        'icm-simulator',
      ),
    [icmVariant, heroStackBb],
  );

  return (
    <>
      <SEOHead
        title="Tournament ICM Equity Simulator"
        description="Calculate Malmuth-Harville Tournament Prize Pool Equity, Bubble Factors, And Risk Premiums Across Multi-Table Payout Structures On Smarter.Poker."
        canonical="/hub/training/icm-simulator"
      />
      <div className={at.shell}>
        <TrainingPageHead slug="training-icm-simulator" note="Final Table Math & Deal Calculator" />

        <div className={at.page}>
          {/* Inputs */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="icms-prizes-title">
            <h2 id="icms-prizes-title" className={at.sectionTitle}>Prize Pool Structure</h2>
            <div className={at.fieldList}>
              {payouts.map((p, i) => {
                const place = `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`;
                return (
                  <label key={`payout-${i}`} className={at.fieldRow}>
                    <span className={at.seatTag}>{place}</span>
                    <input
                      aria-label={`${place} Place Payout`}
                      type="number"
                      inputMode="decimal"
                      className={at.input}
                      value={p}
                      onChange={(e) => {
                        const arr = [...payouts];
                        arr[i] = e.target.value;
                        setPayouts(arr);
                      }}
                    />
                    <span className={at.unit}>USD</span>
                  </label>
                );
              })}
            </div>
            <div className={at.panelHead} style={{ borderTop: '1px solid rgba(124, 158, 187, 0.24)', paddingTop: 10 }}>
              <span className={at.label}>Total Prize Pool</span>
              <strong className={at.white} style={{ fontSize: '1.1rem' }}>${totalPrizePool.toLocaleString()}</strong>
            </div>
          </section>

          <section className={`sd-panel ${at.panel}`} aria-labelledby="icms-stacks-title">
            <div className={at.panelHead}>
              <h2 id="icms-stacks-title" className={at.sectionTitle}>Player Stacks</h2>
              <span className={at.small}>Total: {totalChips.toLocaleString()}</span>
            </div>

            <div className={at.fieldList}>
              {players.map((p, i) => (
                <div key={p.id} className={at.stackRow}>
                  <input
                    aria-label={`Player ${i + 1} Name`}
                    className={at.input}
                    data-hero={p.id === 1 ? 'true' : undefined}
                    value={p.name}
                    onChange={(e) => {
                      const arr = [...players];
                      arr[i].name = e.target.value;
                      setPlayers(arr);
                    }}
                  />
                  <input
                    aria-label={`${p.name || `Player ${i + 1}`} Stack`}
                    type="number"
                    inputMode="numeric"
                    className={at.input}
                    value={p.stack}
                    onChange={(e) => {
                      const arr = [...players];
                      arr[i].stack = e.target.value;
                      setPlayers(arr);
                    }}
                  />
                </div>
              ))}
            </div>

            <motion.button
              type="button"
              className={`sd-button sd-primary ${at.primary}`}
              whileTap={{ scale: 0.98 }}
              onClick={runSim}
              disabled={calculating}
            >
              {calculating ? 'Calculating…' : 'Run ICM Calculator'}
            </motion.button>
            {calculationError && (
              <div role="alert" className={at.error}>
                {calculationError}
              </div>
            )}
          </section>

          {/* Output */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="icms-output-title">
            <h2 id="icms-output-title" className={at.sectionTitle}>ICM Value Distribution</h2>
            <p className={at.copy}>
              Independent Chip Model Converts Raw Tournament Chips Into Actual Dollar Equity
              Mapped To The Remaining Prize Pool Structure.
            </p>

            {equities.length > 0 ? (
              <div className={at.list}>
                {[...players]
                  .map((p, i) => ({ ...p, eq: equities[i] }))
                  .sort((a, b) => b.eq - a.eq)
                  .map((p, rank) => {
                    const chipPct = (p.stack / totalChips) * 100;
                    const eqPct = (p.eq / totalPrizePool) * 100;
                    const isHero = p.id === 1;

                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: rank * 0.1 }}
                        className={`sd-metric ${at.panel} ${at.tight}`}
                        data-active={isHero ? 'true' : undefined}
                        style={{ textAlign: 'left' }}
                      >
                        <div className={at.barHead}>
                          <strong className={isHero ? at.ice : at.white} style={{ fontSize: '1rem' }}>{p.name}</strong>
                          <strong className={at.white} style={{ fontSize: '1.1rem' }}>
                            $
                            {p.eq.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                        </div>

                        <div className={at.row} style={{ columnGap: 18 }}>
                          <span className={at.small}>
                            <strong className={at.white}>Chips:</strong>{' '}
                            {(Number.isFinite(Number(chipPct)) ? Number(chipPct) : 0).toFixed(1)}% ({Number(p.stack).toLocaleString()})
                          </span>
                          <span className={at.small}>
                            <strong className={at.white}>Prize EQ:</strong>{' '}
                            {(Number.isFinite(Number(eqPct)) ? Number(eqPct) : 0).toFixed(1)}%
                          </span>
                        </div>

                        <div className={at.track}>
                          <motion.div
                            className={`${at.fill} ${isHero ? '' : at.fillSilver}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${eqPct}%` }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
              </div>
            ) : (
              <div className={at.empty}>
                <Calculator size={36} aria-hidden />
                <h3 className={at.subTitle}>Run The Calculator</h3>
                <p className={at.copy}>Fill In Stacks And Payouts.</p>
              </div>
            )}
          </section>
        </div>
      </div>
      <HubPageSummary page="training-icm-simulator" />
    </>
  );
}
