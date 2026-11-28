// TRAIN-CSS-TOKENS-BATCH5-59 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useCallback, useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';
// BUG FIX (TRAIN-TPP-A11Y-1): SVG icons replacing the bare back-arrow +
// strategy-tip lightbulb. Strict build-safety rules from PR #362/#365/#369
// — no JSX comments inside conditional expressions, no emoji chars in
// legacy fallback strings. Same surface-specific a11y pattern as PR
// #320/#322/#324/#327-#361/#373/#375.
const _TPP_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function TppLightbulbIcon({ size = 14 }) {
  return (
    <svg {..._TPP_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.65V17h8v-2.35A7 7 0 0 0 12 2z" />
    </svg>
  );
}

export default function TournamentPrepPlanner() {
  const router = useRouter();
  useTrainingBus('tournament-prep');

  const [buyIn, setBuyIn] = useState(109);
  const [startStack, setStartStack] = useState(10000);
  const [blindLevelLength, setBlindLevelLength] = useState(15);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [plannerLoaded, setPlannerLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loadPlannerState = async () => {
      if (!getAccessToken()) {
        if (active) setPlannerLoaded(true);
        return;
      }
      try {
        const response = await authedFetch('/api/training/tool-records?toolId=tournament-prep&recordType=planner&limit=1');
        if (!response.ok) throw new Error(`Planner load failed (${response.status})`);
        const payload = await response.json();
        const saved = payload.records?.[0]?.data;
        if (active && saved) {
          const isPositiveMetric = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
          if (isPositiveMetric(saved.buyIn)) setBuyIn(Number(saved.buyIn));
          if (isPositiveMetric(saved.startStack)) setStartStack(Number(saved.startStack));
          if (isPositiveMetric(saved.blindLevelLength)) setBlindLevelLength(Number(saved.blindLevelLength));
          if (isPositiveMetric(saved.currentLevel)) setCurrentLevel(Number(saved.currentLevel));
        }
      } catch (error) {
        console.warn('Failed to load tournament plan:', error?.message || error);
      } finally {
        if (active) setPlannerLoaded(true);
      }
    };
    loadPlannerState();
    return () => { active = false; };
  }, []);

  // Derived states
  const bls = [
    { level: 1, sb: 25, bb: 50, ante: 5 },
    { level: 2, sb: 50, bb: 100, ante: 10 },
    { level: 3, sb: 75, bb: 150, ante: 15 },
    { level: 4, sb: 100, bb: 200, ante: 25 },
    { level: 5, sb: 150, bb: 300, ante: 40 },
    { level: 6, sb: 200, bb: 400, ante: 50 },
    { level: 7, sb: 250, bb: 500, ante: 60 },
    { level: 8, sb: 300, bb: 600, ante: 75 },
    { level: 9, sb: 400, bb: 800, ante: 100 },
    { level: 10, sb: 500, bb: 1000, ante: 125 },
    { level: 11, sb: 600, bb: 1200, ante: 150 },
    { level: 12, sb: 800, bb: 1600, ante: 200 },
  ];

  const currentBlindInfo = bls.find((b) => b.level === currentLevel) || bls[bls.length - 1];
  const mDenom = currentBlindInfo.sb + currentBlindInfo.bb + currentBlindInfo.ante * 9;
  const initialM = mDenom > 0 ? startStack / mDenom : 0;
  const initialBBs = currentBlindInfo.bb > 0 ? startStack / currentBlindInfo.bb : 0;

  const [activeTab, setActiveTab] = useState('structure');

  // Planner settings are durable tool state, not a scored training session.
  const savePlannerState = useCallback(async () => {
    if (!getAccessToken()) return;
    try {
      const response = await authedFetch('/api/training/tool-records', {
        method: 'POST',
        body: JSON.stringify({
          toolId: 'tournament-prep',
          recordType: 'planner',
          recordKey: 'current-plan',
          data: {
            buyIn,
            startStack,
            blindLevelLength,
            currentLevel,
          },
        }),
      });
      if (!response.ok) throw new Error(`Planner sync failed (${response.status})`);
    } catch (e) {
      console.warn('Failed to sync tournament plan:', e);
    }
  }, [blindLevelLength, buyIn, currentLevel, startStack]);

  useEffect(() => {
    if (!plannerLoaded) return undefined;
    const timer = setTimeout(savePlannerState, 400);
    return () => clearTimeout(timer);
  }, [buyIn, startStack, blindLevelLength, currentLevel, plannerLoaded, savePlannerState]);

  return (
    <>
    <PageTransition>
      <SEOHead
        title="Tournament Structure & M-Ratio Planner"
        description="Analyze Tournament Blind Level Duration, Starting Stack Depth, And Harrington M-Ratio Zones Before Registering For Your Next Event On Smarter.Poker."
        canonical="/hub/training/tournament-prep"
      />
      <UniversalHeader pageDepth={2} hideLeftIcon />

      <div className={s.shell}>
        <main className={`${s.page} ${s.wide}`}>
          <TrainingPageHead slug="training-tournament-prep" note="ICM-Aware Strategy & Structure Analysis" />
          <div className={s.split}>
            {/* LEFT COLUMN: Controls */}
            <div className={s.splitSide}>
              <section className={`sd-panel ${s.panel}`} aria-labelledby="tpp-settings-title">
                <h2 id="tpp-settings-title" className={s.sectionTitle}>Tournament Settings</h2>
                <div className={s.formGrid}>
                  <label htmlFor="tournament-buy-in" className={s.fieldLabel}>
                    Buy-In ($)
                    <input
                      id="tournament-buy-in"
                      type="number"
                      inputMode="decimal"
                      value={buyIn}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setBuyIn(Number.isFinite(v) && v >= 0 ? v : 0);
                      }}
                      className={s.field}
                    />
                  </label>
                  <label htmlFor="tournament-starting-stack" className={s.fieldLabel}>
                    Starting Stack
                    <input
                      id="tournament-starting-stack"
                      type="number"
                      inputMode="numeric"
                      value={startStack}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setStartStack(Number.isFinite(v) && v >= 0 ? v : 0);
                      }}
                      className={s.field}
                    />
                  </label>
                  <label htmlFor="tournament-blind-level-length" className={s.fieldLabel}>
                    Blind Level Length (Min)
                    <input
                      id="tournament-blind-level-length"
                      type="number"
                      inputMode="numeric"
                      value={blindLevelLength}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setBlindLevelLength(Number.isFinite(v) && v >= 1 ? v : 1);
                      }}
                      className={s.field}
                    />
                  </label>
                </div>
                <label htmlFor="tournament-current-level" className={s.fieldLabel}>
                  Current Level
                  <input
                    id="tournament-current-level"
                    type="range"
                    min="1"
                    max="12"
                    value={currentLevel}
                    onChange={(e) => setCurrentLevel(Number(e.target.value))}
                    className={s.range}
                  />
                </label>
                <div className={s.rangeLabels}>
                  <span>Level 1</span>
                  <strong className={s.ice}>Level {currentLevel}</strong>
                  <span>Level 12</span>
                </div>
              </section>

              <section className={`sd-panel ${s.panel}`} aria-labelledby="tpp-status-title">
                <h2 id="tpp-status-title" className={s.sectionTitle}>Current Status</h2>
                <div className={s.metrics2}>
                  <div className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>Blinds</span>
                    <strong className={s.metricValue}>{currentBlindInfo.sb}/{currentBlindInfo.bb}</strong>
                  </div>
                  <div className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>Ante</span>
                    <strong className={s.metricValue}>{currentBlindInfo.ante}</strong>
                  </div>
                  <div className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>Starting Stack In BBs</span>
                    <strong className={s.metricValue} data-tone={initialBBs < 20 ? 'down' : 'ice'}>
                      {Number.isFinite(initialBBs) ? (Number.isFinite(Number(initialBBs)) ? Number(initialBBs) : 0).toFixed(1) : '0.0'} BB
                    </strong>
                  </div>
                  <div className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>Starting Stack M-Ratio</span>
                    <strong className={s.metricValue}>
                      {Number.isFinite(initialM) ? (Number.isFinite(Number(initialM)) ? Number(initialM) : 0).toFixed(1) : '0.0'}
                    </strong>
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Analysis Display */}
            <section className={`sd-panel ${s.panel} ${s.splitMain}`} aria-label="Structure Analysis">
              <div className={s.segmented} role="group" aria-label="Analysis View">
                <button
                  type="button"
                  aria-label="View Structure Flow"
                  aria-pressed={activeTab === 'structure'}
                  onClick={() => setActiveTab('structure')}
                  className={`sd-button ${s.button}`}
                >
                  Structure Flow
                </button>
                <button
                  type="button"
                  aria-label="View Push/Fold"
                  aria-pressed={activeTab === 'pushfold'}
                  onClick={() => setActiveTab('pushfold')}
                  className={`sd-button ${s.button}`}
                >
                  Push/Fold Engine
                </button>
              </div>

              {activeTab === 'structure' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={s.panel}>
                  <h3 className={s.subTitle}>Blind Structure Projections</h3>
                  <div className={s.tableWrap}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th>Level</th>
                          <th>Blinds</th>
                          <th>Stack If No Hands Played</th>
                          <th>Zone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bls.map((b) => {
                          // Rough estimation of stack drain assuming 3 orbits per level
                          let estStack = startStack;
                          for (let i = 1; i <= b.level; i++) {
                            const lvlInfo = bls[i - 1];
                            const drain = (lvlInfo.sb + lvlInfo.bb + lvlInfo.ante * 9) * 3;
                            if (i < b.level) estStack -= drain;
                          }
                          const bbCount = b.bb > 0 ? estStack / b.bb : 0;
                          const zoneKey =
                            bbCount > 40 ? 'green' : bbCount > 20 ? 'yellow' : bbCount > 10 ? 'orange' : 'red';
                          const zone = {
                            green: 'Green (Comfort)',
                            yellow: 'Yellow (Active)',
                            orange: 'Orange (Steal)',
                            red: 'Red (Push/Fold)',
                          }[zoneKey];
                          const isCurrent = currentLevel === b.level;
                          return (
                            <tr key={b.level} className={isCurrent ? s.currentRow : undefined} aria-current={isCurrent ? 'step' : undefined}>
                              <td className={isCurrent ? s.ice : undefined}>{b.level}</td>
                              <td>
                                <span className={s.cellMain}>{b.sb}/{b.bb}</span>
                                <span className={s.cellSub}>Ante {b.ante}</span>
                              </td>
                              <td>
                                <span className={s.cellMain}>{Math.max(0, estStack)}</span>
                                <span className={s.cellSub}>{Math.max(0, bbCount).toFixed(1)} BB</span>
                              </td>
                              <td>
                                {estStack <= 0 ? (
                                  <span className={s.down}>Busted</span>
                                ) : (
                                  <span className={s.zone}>
                                    <span className={s.zoneSwatch} data-zone={zoneKey} aria-hidden />
                                    <span className={zoneKey === 'red' ? s.down : undefined}>
                                      <span className={s.cellMain}>{zone.split(' (')[0]}</span>
                                      <span className={s.cellSub}>{zone.split(' (')[1].replace(')', '')}</span>
                                    </span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {activeTab === 'pushfold' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={s.panel}>
                  <h3 className={s.subTitle}>Nash Equilibrium Push/Fold</h3>
                  <p className={s.copy}>
                    Calculated For Your Estimated Stack Depth At Level {currentLevel} (
                    {Number.isFinite(initialBBs) ? (Number.isFinite(Number(initialBBs)) ? Number(initialBBs) : 0).toFixed(1) : '0.0'} BB Initial,
                    Currently ~
                    {currentBlindInfo.bb > 0
                      ? (Number.isFinite(Number(startStack / currentBlindInfo.bb)) ? Number(startStack / currentBlindInfo.bb) : 0).toFixed(1)
                      : '0.0'}{' '}
                    BB Effective).
                  </p>
                  <div className={s.grid}>
                    <div className={`sd-metric ${s.card}`}>
                      <h4 className={`${s.subTitle} ${s.ice}`}>UTG/Early Position</h4>
                      <p className={s.copy}>
                        Push: <span className={s.white}>77+, A9s+, AJo+, KTs+, KQo</span>
                        <br />
                        <span className={s.ice}>Fold Everything Else.</span> The Danger
                        Of Calling Off With Medium Stacks Is Immense.
                      </p>
                    </div>
                    <div className={`sd-metric ${s.card}`}>
                      <h4 className={`${s.subTitle} ${s.ice}`}>BTN/Late Position</h4>
                      <p className={s.copy}>
                        Push: <span className={s.white}>22+, A2s+, A2o+, K2s+, K8o+, Q8s+, QTo+, J8s+, T8s+, 98s</span>
                        <br />
                        <span className={s.ice}>Expand Shoving Range</span> To Exploit
                        Tight Blinds.
                      </p>
                    </div>
                  </div>
                  <div className={s.note}>
                    <p className={`${s.subTitle} ${s.iconLabel} ${s.ice}`}>
                      <TppLightbulbIcon size={14} />
                      Strategy Tip (Level {currentLevel})
                    </p>
                    <p className={s.copy}>
                      {initialBBs < 20
                        ? 'You Are In Pure Push/Fold Territory. Do Not Open-Raise To Fold. Only Shove Or Fold Preflop To Maximize Fold Equity.'
                        : 'You Have Room To Maneuver. Use Smaller Open Sizes (2x - 2.2x) To Preserve Your Stack While Stealing Blinds.'}
                    </p>
                  </div>
                </motion.div>
              )}
            </section>
          </div>
        </main>
      </div>
    </PageTransition>
    <ConnectionToast />
      <HubPageSummary page="training-tournament-prep" />
    </>
  );
}
